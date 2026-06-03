/**
 * ─── Import CSV de prospects ─────────────────────────────────────────────
 *
 * Wizard d'import multi-étapes :
 *   1. Upload  → drag & drop ou click pour sélectionner le CSV
 *   2. Preview → mapping auto-détecté + aperçu des 5 premières lignes
 *                + détection des doublons (par email) + tag batch optionnel
 *   3. Import  → progression batch par batch (200/lot pour gros volumes)
 *   4. Result  → récap (créés / dédupliqués / erreurs)
 *
 * Détecte automatiquement les headers CSV provenant de :
 *   • Apollo.io (First Name, Last Name, Title, Email, LinkedIn Url…)
 *   • LinkedIn Sales Navigator
 *   • Hunter.io / Snov.io
 *   • CSV maison (prenom, nom, email, telephone…)
 *
 * Le mapping prend en charge TOUS les champs étendus du schéma prospects :
 *   title, linkedin_url, company_domain, industry, location, etc.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv";

// ─── Champs CRM cibles ────────────────────────────────────────────────────
type CrmField =
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "company"
  | "website"
  | "title"
  | "linkedin_url"
  | "company_domain"
  | "company_size"
  | "industry"
  | "seniority"
  | "location"
  | "photo_url"
  | "notes"
  | "tags"
  | "source";

const FIELD_LABELS: Record<CrmField, string> = {
  first_name: "Prénom",
  last_name: "Nom",
  email: "Email",
  phone: "Téléphone",
  company: "Société",
  website: "Site web",
  title: "Poste",
  linkedin_url: "LinkedIn",
  company_domain: "Domaine société",
  company_size: "Taille société",
  industry: "Secteur",
  seniority: "Séniorité",
  location: "Localisation",
  photo_url: "Photo URL",
  notes: "Notes",
  tags: "Tags",
  source: "Source",
};

/**
 * Dictionnaire de correspondance header CSV → champ CRM.
 * Couvre les exports Apollo, LinkedIn, Hunter, Snov, et formats français.
 * Normalisé en lowercase + sans accents pour comparaison robuste.
 */
const HEADER_ALIASES: Record<string, CrmField> = {
  // Prénom
  "first name": "first_name",
  "firstname": "first_name",
  "prenom": "first_name",
  "prénom": "first_name",

  // Nom
  "last name": "last_name",
  "lastname": "last_name",
  "nom": "last_name",
  "surname": "last_name",

  // Email
  "email": "email",
  "e-mail": "email",
  "mail": "email",
  "email address": "email",
  "personal email": "email",
  "work email": "email",
  "email status": "email", // Apollo

  // Phone
  "phone": "phone",
  "telephone": "phone",
  "téléphone": "phone",
  "tel": "phone",
  "mobile": "phone",
  "mobile phone": "phone",
  "direct phone": "phone",
  "company phone": "phone",
  "phone number": "phone",

  // Company
  "company": "company",
  "societe": "company",
  "société": "company",
  "entreprise": "company",
  "organization": "company",
  "company name": "company",
  "account name": "company",

  // Website
  "website": "website",
  "site web": "website",
  "site_web": "website",
  "site": "website",
  "url": "website",
  "company website": "website",
  "company_website": "website",

  // Title (poste)
  "title": "title",
  "position": "title",
  "job title": "title",
  "poste": "title",
  "fonction": "title",
  "role": "title",

  // LinkedIn
  "linkedin": "linkedin_url",
  "linkedin url": "linkedin_url",
  "linkedin_url": "linkedin_url",
  "person linkedin url": "linkedin_url",
  "linkedin profile": "linkedin_url",
  "profile url": "linkedin_url",

  // Company domain
  "company domain": "company_domain",
  "company_domain": "company_domain",
  "domain": "company_domain",
  "primary domain": "company_domain",

  // Company size
  "company size": "company_size",
  "company_size": "company_size",
  "# employees": "company_size",
  "employees": "company_size",
  "employee count": "company_size",
  "taille société": "company_size",
  "effectif": "company_size",

  // Industry
  "industry": "industry",
  "secteur": "industry",
  "industry tag": "industry",
  "company industry": "industry",

  // Seniority
  "seniority": "seniority",
  "seniorite": "seniority",
  "séniorité": "seniority",
  "level": "seniority",

  // Location
  "city": "location",
  "ville": "location",
  "country": "location",
  "pays": "location",
  "location": "location",
  "localisation": "location",
  "state": "location",
  "region": "location",
  "région": "location",

  // Photo
  "photo": "photo_url",
  "photo url": "photo_url",
  "photo_url": "photo_url",
  "avatar": "photo_url",
  "profile photo": "photo_url",

  // Notes
  "notes": "notes",
  "note": "notes",
  "commentaire": "notes",
  "comment": "notes",

  // Tags
  "tags": "tags",
  "tag": "tags",
  "etiquettes": "tags",
  "étiquettes": "tags",
  "labels": "tags",

  // Source
  "source": "source",
  "lead source": "source",
  "origin": "source",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/\s+/g, " ");
}

/**
 * Détecte automatiquement le mapping CSV header → CRM field.
 * Retourne un objet { csvHeader: crmField | null }.
 */
function autoDetectMapping(csvHeaders: string[]): Record<string, CrmField | null> {
  const mapping: Record<string, CrmField | null> = {};
  for (const h of csvHeaders) {
    const normalized = normalizeHeader(h);
    mapping[h] = HEADER_ALIASES[normalized] || null;
  }
  return mapping;
}

/**
 * Concatène plusieurs valeurs en une seule (pour location: city + country, etc.)
 * Évite les doublons et les valeurs vides.
 */
function concatUnique(values: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out.join(", ");
}

/**
 * Transforme une ligne CSV en payload prospect prêt à insérer.
 * Si plusieurs colonnes CSV mappent vers le même champ CRM (ex: city + country → location),
 * elles sont concaténées.
 */
function buildPayload(
  row: Record<string, string>,
  mapping: Record<string, CrmField | null>,
  ownerId: string,
  batchTag: string | null,
): Record<string, unknown> | null {
  // Regrouper les valeurs par champ CRM (plusieurs CSV cols → 1 CRM field possible)
  const grouped: Record<string, string[]> = {};
  for (const csvHeader in mapping) {
    const field = mapping[csvHeader];
    if (!field) continue;
    const value = row[csvHeader];
    if (!value || !value.trim()) continue;
    grouped[field] = grouped[field] || [];
    grouped[field].push(value.trim());
  }

  // Validation : first_name et last_name requis
  const firstName = grouped.first_name?.[0]?.trim();
  const lastName = grouped.last_name?.[0]?.trim();
  if (!firstName || !lastName) return null;

  // Tags du CSV + tag batch optionnel
  const csvTags = grouped.tags?.[0]
    ? grouped.tags[0]
        .split(/[,;|]/)
        .map((t: string) => t.trim())
        .filter(Boolean)
    : [];
  const tags = batchTag ? [...csvTags, batchTag] : csvTags;

  // batchTag finit dans `tags` (sémantique d'opération), pas dans `source`
  // (sémantique d'origine du lead). On laisse le statut au défaut du schéma.
  return {
    owner_id: ownerId,
    first_name: firstName,
    last_name: lastName,
    email: grouped.email?.[0] || null,
    phone: grouped.phone?.[0] || null,
    company: grouped.company?.[0] || null,
    website: grouped.website?.[0] || null,
    title: grouped.title?.[0] || null,
    linkedin_url: grouped.linkedin_url?.[0] || null,
    company_domain: grouped.company_domain?.[0] || null,
    company_size: grouped.company_size?.[0] || null,
    industry: grouped.industry?.[0] || null,
    seniority: grouped.seniority?.[0] || null,
    location: grouped.location ? concatUnique(grouped.location) : null,
    photo_url: grouped.photo_url?.[0] || null,
    notes: grouped.notes?.[0] || null,
    source: grouped.source?.[0] || "csv_import",
    tags,
  };
}

// ─── Composant principal ──────────────────────────────────────────────────

type Stage = "upload" | "preview" | "importing" | "result";

export function ImportCSVDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CrmField | null>>({});
  const [batchTag, setBatchTag] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    created: number;
    duplicates: number;
    errors: number;
    errorMessages: string[];
  } | null>(null);

  // Reset quand on ferme le dialog
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStage("upload");
        setFileName("");
        setCsvHeaders([]);
        setCsvRows([]);
        setMapping({});
        setBatchTag("");
        setProgress(0);
        setResult(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Extrait les emails normalisés présents dans le CSV (déduplique au passage).
  // On ne va requêter que ceux-là pour le check dédup — scale même avec 50k+
  // prospects en base (vs charger tous les emails du user).
  const csvEmails = useMemo(() => {
    const out = new Set<string>();
    if (csvRows.length === 0) return out;
    const emailCol = Object.keys(mapping).find((k) => mapping[k] === "email");
    if (!emailCol) return out;
    for (const row of csvRows) {
      const e = row[emailCol]?.toLowerCase().trim();
      if (e) out.add(e);
    }
    return out;
  }, [csvRows, mapping]);

  // Check dédup : interroge uniquement les emails du CSV (par lots de 500 pour
  // contourner la limite .in() de PostgREST). Activé seulement au stage preview.
  const { data: existingEmails } = useQuery({
    queryKey: ["import-dedup", user?.id, csvEmails.size, Array.from(csvEmails).sort().join("|").slice(0, 200)],
    enabled: !!user && stage === "preview" && csvEmails.size > 0,
    queryFn: async () => {
      const all = Array.from(csvEmails);
      const found = new Set<string>();
      for (let i = 0; i < all.length; i += 500) {
        const chunk = all.slice(i, i + 500);
        const { data } = await supabase
          .from("prospects")
          .select("email")
          .eq("owner_id", user!.id)
          .in("email", chunk);
        for (const r of ((data || []) as Array<{ email: string | null }>)) {
          const e = r.email?.toLowerCase().trim();
          if (e) found.add(e);
        }
      }
      return found;
    },
  });

  // ─── Upload ──────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Fichier CSV requis");
      return;
    }
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("CSV vide ou mal formé");
        return;
      }
      const headers = Object.keys(rows[0]);
      setFileName(file.name);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoDetectMapping(headers));
      setStage("preview");
    } catch (e) {
      toast.error("Erreur de lecture du CSV", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ─── Build des payloads SANS le batchTag (recalculé seulement quand le
  // mapping ou le CSV change — pas à chaque keystroke dans le champ tag). ──
  const basePayloads = useMemo(() => {
    if (!user || csvRows.length === 0) {
      return { valid: 0, invalid: 0, duplicates: 0, payloads: [] as Record<string, unknown>[] };
    }
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;
    const payloads: Record<string, unknown>[] = [];
    const seenEmailsInBatch = new Set<string>();

    for (const row of csvRows) {
      const payload = buildPayload(row, mapping, user.id, null);
      if (!payload) {
        invalid++;
        continue;
      }
      const email = (payload.email as string | null)?.toLowerCase().trim();
      if (email && existingEmails?.has(email)) {
        duplicates++;
        continue;
      }
      if (email && seenEmailsInBatch.has(email)) {
        duplicates++;
        continue;
      }
      if (email) seenEmailsInBatch.add(email);
      valid++;
      payloads.push(payload);
    }
    return { valid, invalid, duplicates, payloads };
  }, [csvRows, mapping, user, existingEmails]);

  // ─── Applique le batchTag aux payloads de base (cheap : juste append aux tags). ─
  const previewStats = useMemo(() => {
    const tag = batchTag.trim();
    if (!tag) return basePayloads;
    return {
      ...basePayloads,
      payloads: basePayloads.payloads.map((p) => ({
        ...p,
        tags: [...((p.tags as string[]) || []), tag],
      })),
    };
  }, [basePayloads, batchTag]);

  // ─── Import (par lots de 200 pour gros volumes) ──────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      setStage("importing");
      setProgress(0);

      const payloads = previewStats.payloads;
      const BATCH_SIZE = 200;
      let created = 0;
      const errorMessages: string[] = [];

      for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
        const batch = payloads.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.from("prospects").insert(batch as never).select("id");
        if (error) {
          errorMessages.push(error.message);
        } else {
          created += data?.length ?? 0;
        }
        setProgress(Math.min(100, Math.round(((i + batch.length) / payloads.length) * 100)));
      }

      return {
        created,
        duplicates: previewStats.duplicates,
        errors: previewStats.invalid + errorMessages.length,
        errorMessages,
      };
    },
    onSuccess: (res) => {
      setResult(res);
      setStage("result");
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["import-dedup", user?.id] });
      if (res.created > 0) toast.success(`${res.created} prospect(s) importé(s)`);
    },
    onError: (e: Error) => {
      toast.error("Erreur d'import", { description: e.message });
      setStage("preview");
    },
  });

  // ─── UI ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importer des prospects depuis un CSV
          </DialogTitle>
          <DialogDescription>
            Glisse un fichier CSV (Apollo, LinkedIn, Hunter, Snov, ou tout autre format). Le mapping
            des colonnes est détecté automatiquement.
          </DialogDescription>
        </DialogHeader>

        {/* ─── STAGE 1 : Upload ──────────────────────────────────────── */}
        {stage === "upload" && (
          <div
            className={`mt-4 rounded-lg border-2 border-dashed p-12 text-center transition cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">
              Glisse ton fichier CSV ici ou clique pour parcourir
            </p>
            <p className="text-xs text-muted-foreground">
              Formats supportés : Apollo, LinkedIn, Hunter, Snov, CSV maison (FR/EN)
            </p>
          </div>
        )}

        {/* ─── STAGE 2 : Preview & Mapping ─────────────────────────────── */}
        {stage === "preview" && (
          <div className="space-y-5 mt-2">
            {/* File header */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium truncate">{fileName}</span>
                <Badge variant="outline" className="ml-2 flex-shrink-0">
                  {csvRows.length} ligne{csvRows.length > 1 ? "s" : ""}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStage("upload")}>
                <X className="h-4 w-4 mr-1" /> Changer
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {previewStats.valid}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">à créer</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {previewStats.duplicates}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">doublons (ignorés)</div>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                  {previewStats.invalid}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">invalides (prénom/nom manquant)</div>
              </div>
            </div>

            {/* Mapping table */}
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Correspondance des colonnes
              </Label>
              <div className="mt-2 rounded-lg border max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium text-xs">Colonne CSV</th>
                      <th className="text-left p-2 font-medium text-xs">→ Champ CRM</th>
                      <th className="text-left p-2 font-medium text-xs">Aperçu (ligne 1)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvHeaders.map((h) => {
                      const detected = mapping[h];
                      const sample = csvRows[0]?.[h] || "";
                      return (
                        <tr key={h} className="border-t">
                          <td className="p-2 font-mono text-xs">{h}</td>
                          <td className="p-2">
                            <select
                              className="text-xs border rounded px-1 py-0.5 bg-background"
                              value={detected ?? ""}
                              onChange={(e) =>
                                setMapping((m) => ({
                                  ...m,
                                  [h]: e.target.value ? (e.target.value as CrmField) : null,
                                }))
                              }
                            >
                              <option value="">— Ignorer —</option>
                              {(Object.keys(FIELD_LABELS) as CrmField[]).map((f) => (
                                <option key={f} value={f}>
                                  {FIELD_LABELS[f]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">
                            {sample || <span className="italic">(vide)</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tag batch optionnel */}
            <div>
              <Label htmlFor="batch-tag" className="text-xs uppercase tracking-wide text-muted-foreground">
                Tag à appliquer à tous les prospects de cet import (optionnel)
              </Label>
              <Input
                id="batch-tag"
                value={batchTag}
                onChange={(e) => setBatchTag(e.target.value)}
                placeholder="ex: Apollo Toulouse 2026-06-02"
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Pratique pour identifier rapidement les prospects venus de cet import dans tes filtres.
              </p>
            </div>

            {/* Actions */}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={previewStats.valid === 0}
                className="gap-2"
              >
                {previewStats.valid === 0 ? (
                  <>
                    <AlertCircle className="h-4 w-4" /> Aucun prospect à importer
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Importer {previewStats.valid} prospect{previewStats.valid > 1 ? "s" : ""}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ─── STAGE 3 : Importing ─────────────────────────────────────── */}
        {stage === "importing" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
            <p className="text-sm font-medium">Import en cours…</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {/* ─── STAGE 4 : Result ────────────────────────────────────────── */}
        {stage === "result" && result && (
          <div className="py-4 space-y-5">
            <div className="text-center">
              <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold">Import terminé</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {result.created} prospect{result.created > 1 ? "s" : ""} créé{result.created > 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-center">
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {result.created}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">créés</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-center">
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {result.duplicates}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">déjà existants</div>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-center">
                <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                  {result.errors}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">erreurs</div>
              </div>
            </div>

            {result.errorMessages.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-xs">
                <p className="font-medium text-rose-900 dark:text-rose-200 mb-1">
                  Détails des erreurs :
                </p>
                {result.errorMessages.slice(0, 3).map((e, i) => (
                  <p key={i} className="text-rose-700 dark:text-rose-300">
                    • {e}
                  </p>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Fermer</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
