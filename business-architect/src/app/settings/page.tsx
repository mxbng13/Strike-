import { requirePageUser } from "@/lib/page-auth";
import { currentWorkspaceId, getWorkspaceSettings, requireWorkspaceRole } from "@/workspaces/service";
import { providerStatus } from "@/research/providers";
import { sandboxCapabilities } from "@/sandbox/runner";
import { llmProvider } from "@/ai/registry";
import { spendSummary, costBreakdown } from "@/finops/guard";
import { RESEARCH_PRICES_USD } from "@/ai/pricing";
import { Card, Badge, fmtEur, Empty } from "@/components/ui";
import { JsonForm } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requirePageUser();
  const ws = await currentWorkspaceId(user.id);
  const role = await requireWorkspaceRole(user.id, ws);
  const settings = await getWorkspaceSettings(ws);
  const providers = providerStatus();
  const sandbox = sandboxCapabilities();
  const llm = llmProvider();
  const spend = await spendSummary({ workspaceId: ws });
  const breakdown = await costBreakdown(ws);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paramètres de l'espace</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Intelligence artificielle">
          <p className="mb-3 text-sm">Modèle : <code>{llm.model}</code> · {llm.available() ? <Badge tone="green">clé configurée</Badge> : <Badge tone="amber">ANTHROPIC_API_KEY absente : mode heuristique</Badge>}</p>
          {role === "owner" || role === "admin" ? (
            <JsonForm url={`/api/workspaces/${ws}/settings`} submitLabel="Enregistrer" fields={[
              { name: "aiMode", label: "Mode de génération", type: "select", value: settings.aiMode, options: [["auto", "Automatique (IA si la clé est configurée)"], ["llm", "IA obligatoire"], ["heuristic", "Heuristique uniquement (aucun coût IA)"]] },
              { name: "monthlyAiBudgetEur", label: "Budget IA mensuel de l'espace (€)", type: "number", value: settings.monthlyAiBudgetEur },
              { name: "defaultProjectAiBudgetEur", label: "Budget IA par défaut d'un nouveau projet (€)", type: "number", value: settings.defaultProjectAiBudgetEur },
            ]} />
          ) : <p className="text-sm text-ink-2">Seuls les administrateurs peuvent modifier ces réglages.</p>}
          <p className="mt-3 text-sm">Ce mois : {fmtEur(spend.workspaceMonth.spent, 4)} / {fmtEur(spend.workspaceMonth.limit)}</p>
        </Card>
        <Card title="Connecteurs de recherche">
          <ul className="space-y-2 text-sm">
            {providers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{p.label}{p.countries ? ` (${p.countries.join(", ")})` : ""}</span>
                {p.available ? <Badge tone="green">actif</Badge> : <Badge tone="gray" title={p.reason ?? ""}>non configuré</Badge>}
                <span className="w-full text-xs text-ink-2">{RESEARCH_PRICES_USD[p.id]?.note}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Sandbox d'exécution du code généré">
          <ul className="space-y-1 text-sm">
            <li>Isolation réseau : {sandbox.networkIsolation ? <Badge tone="green">namespace réseau vide</Badge> : <Badge tone="red">indisponible</Badge>}</li>
            <li>Limites de ressources (prlimit) : {sandbox.resourceLimits ? <Badge tone="green">actives</Badge> : <Badge tone="amber">indisponibles</Badge>}</li>
            <li>Système de fichiers : <Badge tone="green">modèle de permissions Node, répertoire temporaire</Badge></li>
          </ul>
        </Card>
        <Card title="Consommation IA par opération (espace)">
          {breakdown.length === 0 ? <Empty>Aucune dépense enregistrée.</Empty> : <div className="prose-ba"><table><thead><tr><th>Fournisseur</th><th>Opération</th><th>Appels</th><th>Coût</th></tr></thead><tbody>{breakdown.map((b) => <tr key={b.provider + b.operation}><td>{b.provider}</td><td>{b.operation}</td><td>{b.calls}</td><td>{fmtEur(b.costEur, 4)}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>
    </div>
  );
}
