/**
 * Componentes-base da interface (sem estado; usáveis em Server Components).
 * Uma regra por componente: docs/design/SISTEMA.md.
 */
export { cx } from "./cx";
export { Button, LinkButton, buttonClass } from "./button";
export { Card, CardHeader, SectionTitle } from "./card";
export { PageHeader } from "./page-header";
export { Badge, Dot, type Tone } from "./badge";
export { Alert } from "./alert";
export { EmptyState } from "./empty-state";
export { Stat, StatGroup } from "./stat";
export { Field, Input, Textarea, Select, inputClass } from "./field";
export { Table, Th, Td } from "./table";
export { TabLinks } from "./tabs";
export { ListSkeleton, FormSkeleton, PieceSkeleton } from "./skeleton";
export { formatDateTime, formatRelative, formatUsd, formatNumber, formatBytes } from "./format";
