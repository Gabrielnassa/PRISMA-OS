"use client";

import { Field, Input } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { useToastAction } from "@/components/toast";
import { driveFolderAction, driveImportAction } from "../actions";

/** Pasta do Google Drive do cliente: link + importar fotos e vídeos para a biblioteca. */
export function DrivePanel({
  clientId,
  folderLink,
  folderName,
  configured,
  serviceEmail,
  canEdit,
  canImport,
}: {
  clientId: string;
  folderLink: string;
  folderName: string | null;
  configured: boolean;
  serviceEmail: string | null;
  canEdit: boolean;
  canImport: boolean;
}) {
  const [saveState, save] = useToastAction(driveFolderAction);
  const [importState, runImport] = useToastAction(driveImportAction);
  return (
    <div className="grid gap-4 p-5">
      {canEdit ? (
        <ActionForm action={save} state={saveState} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <input type="hidden" name="clientId" value={clientId} />
          <Field label="Link da pasta" htmlFor="drive-folder" error={saveState.status === "error" ? saveState.fieldErrors?.folder : undefined}>
            <Input id="drive-folder" name="folder" defaultValue={folderLink} placeholder="https://drive.google.com/drive/folders/..." autoComplete="off" />
          </Field>
          <SubmitButton variant="secondary" pendingText="Conferindo...">
            Salvar pasta
          </SubmitButton>
          {saveState.status === "error" && !saveState.fieldErrors?.folder ? (
            <div className="md:col-span-2">
              <FormMessage state={saveState} />
            </div>
          ) : null}
        </ActionForm>
      ) : folderLink ? (
        <p className="text-[13px] text-ink-300">Pasta: {folderName ?? folderLink}</p>
      ) : null}

      {configured ? (
        <p className="text-[12.5px] leading-relaxed text-ink-400">
          Compartilhe a pasta com <span className="select-all font-medium text-ink-200">{serviceEmail}</span> (como Leitor). Cada clique importa até 25 arquivos novos (fotos PNG, JPEG, GIF, SVG, vídeos MP4 e MOV, PDF); o que já foi importado não entra de novo.
        </p>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-ink-400">
          A leitura do Google Drive ainda não está configurada no servidor (veja Integrações). O link fica salvo e a importação funciona assim que a conta de serviço do Google for definida.
        </p>
      )}

      {folderLink && canImport ? (
        <ActionForm action={runImport} state={importState} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <SubmitButton disabled={!configured} pendingText="Importando...">
            Importar agora
          </SubmitButton>
          {folderName ? <span className="text-[12.5px] text-ink-400">Pasta “{folderName}”</span> : null}
          {importState.status === "error" ? <FormMessage state={importState} /> : null}
        </ActionForm>
      ) : null}
    </div>
  );
}
