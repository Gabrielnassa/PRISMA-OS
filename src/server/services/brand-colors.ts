import { z } from "zod";
import { many, userCtx, withTx } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ValidationError } from "../errors";
import { storage } from "../storage";
import { suggestPalette, type PaletteSuggestion, type SourceImage } from "../brand/palette";
import { downloadMetaImage, fetchInstagramProfile } from "../integrations/instagram";
import { requireClient } from "./clients";
import { uploadMedia } from "./media";
import { audit, userActor } from "./audit";

/**
 * Sugestão de cores da marca. Só sugere: quem decide é a pessoa, que revisa
 * no formulário do perfil da marca e salva.
 */

const MediaIdsSchema = z.array(z.string().uuid()).min(1, "Escolha pelo menos uma imagem.").max(12, "Escolha até 12 imagens.");

export async function suggestColorsFromMedia(auth: AuthContext, clientId: string, mediaIds: string[]): Promise<PaletteSuggestion> {
  assertCan(auth.role, "client.update");
  const ids = MediaIdsSchema.safeParse(mediaIds);
  if (!ids.success) throw new ValidationError(ids.error.issues[0]?.message ?? "Seleção inválida.");
  const rows = await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    return many<{ id: string; kind: string; mime_type: string; storage_key: string }>(
      tx,
      "SELECT id, kind, mime_type, storage_key FROM media_assets WHERE id = ANY($1::uuid[]) AND client_id = $2 AND organization_id = $3 AND deleted_at IS NULL",
      [ids.data, clientId, auth.organizationId],
    );
  });
  if (rows.length === 0) throw new ValidationError("Nenhuma das imagens escolhidas pertence a este cliente.");
  const images: SourceImage[] = [];
  for (const r of rows) {
    if (!r.mime_type.startsWith("image/")) continue;
    images.push({ data: await storage().get(r.storage_key), mimeType: r.mime_type, weight: r.kind === "logo" ? 3 : 1 });
  }
  const s = suggestPalette(images);
  if (!s) throw new ValidationError("Não consegui ler as cores dessas imagens. Use PNG, JPEG, GIF ou SVG (logotipo, foto ou print do perfil).");
  return s;
}

export interface InstagramColors extends PaletteSuggestion {
  username: string;
  name: string | null;
  postsRead: number;
  savedLogoId: string | null;
}

/**
 * Busca o perfil comercial pelo @ (API oficial da Meta), lê a foto de perfil
 * e os posts recentes e sugere as cores. Opcionalmente guarda a foto de perfil
 * na biblioteca do cliente como logotipo.
 */
export async function suggestColorsFromInstagram(
  auth: AuthContext,
  clientId: string,
  handle: string,
  opts: { saveProfilePicture?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<InstagramColors> {
  assertCan(auth.role, "client.update");
  await withTx(userCtx(auth.userId), (tx) => requireClient(tx, auth, clientId));
  const profile = await fetchInstagramProfile(handle, { fetchImpl: opts.fetchImpl });
  // Downloads em paralelo (cada um com limite de tempo e tamanho).
  const [picture, ...posts] = await Promise.all([
    profile.profilePictureUrl ? downloadMetaImage(profile.profilePictureUrl, { fetchImpl: opts.fetchImpl }) : Promise.resolve(null),
    ...profile.mediaImageUrls.slice(0, 9).map((url) => downloadMetaImage(url, { fetchImpl: opts.fetchImpl })),
  ]);
  const images: SourceImage[] = [];
  if (picture) images.push({ ...picture, weight: 3 });
  const postImages = posts.filter((p): p is { data: Buffer; mimeType: string } => p !== null);
  for (const img of postImages) images.push({ ...img, weight: 1 });
  const postsRead = postImages.length;
  const s = suggestPalette(images);
  if (!s) throw new ValidationError(`Encontrei @${profile.username}, mas não consegui ler as imagens do perfil. Tente com o logotipo ou um print do perfil.`);

  let savedLogoId: string | null = null;
  if (opts.saveProfilePicture && picture) {
    assertCan(auth.role, "media.upload");
    const ext = picture.mimeType === "image/png" ? "png" : picture.mimeType === "image/gif" ? "gif" : "jpg";
    const saved = await uploadMedia(auth, clientId, { filename: `instagram-${profile.username}.${ext}`, data: picture.data }, {
      kind: "logo",
      altText: `Foto de perfil do Instagram @${profile.username}`,
      licenseNote: `Foto de perfil do próprio cliente no Instagram (@${profile.username}), obtida pela API oficial da Meta.`,
    });
    savedLogoId = saved.id;
  }
  await withTx(userCtx(auth.userId), (tx) =>
    audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "brand.colors_from_instagram",
      entityType: "client",
      entityId: clientId,
      metadata: { username: profile.username, postsRead, savedLogo: Boolean(savedLogoId) },
    }),
  );
  return { ...s, username: profile.username, name: profile.name, postsRead, savedLogoId };
}
