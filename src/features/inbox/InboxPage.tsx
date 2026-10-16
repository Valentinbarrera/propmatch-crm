import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/Card";
import { SearchIcon } from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { AutomationsDrawer } from "./AutomationsDrawer";
import { summarizeHours, useAutomationRunner } from "./automationEngine";
import { useAutomationState } from "./automationState";
import { buildTemplateContext } from "./templates";
import { ChatView } from "./ChatView";
import { buildConversations, norm, useSeen } from "./conversations";
import { useInboxChannels } from "./channels/useInboxChannels";
import { SourceFilter } from "./channels/SourceFilter";
import { UnifiedConversationList } from "./channels/UnifiedConversationList";
import { ChannelChatView } from "./channels/ChannelChatView";
import { ChannelProfilePanel } from "./channels/ChannelProfilePanel";
import { useInboxFeed } from "./inboxFeed";
import { ProfilePanel } from "./ProfilePanel";

type Tab = "todas" | "no_leidas" | "app";
type View = "list" | "chat" | "profile";

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl px-3 py-1.5 text-center min-w-[84px]" style={{ background: "#F7F0FF" }}>
      <p className="text-base leading-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
        {value}
      </p>
      <p className="text-[11px]" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </p>
    </div>
  );
}

export default function InboxPage() {
  const { agency, currentUserId, contacts, properties, opportunities, matches, profiles, profileById } = useStore();
  const feed = useInboxFeed(agency.id);
  const { seen, mark } = useSeen(agency.id, currentUserId);

  const [tab, setTab] = useState<Tab>("todas");
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [autoOpen, setAutoOpen] = useState(false);
  const autoState = useAutomationState(agency.id);
  const { config: autoConfig } = autoState;

  const all = useMemo(
    () =>
      buildConversations({
        matches: feed.matches,
        messagesByMatch: feed.messagesByMatch,
        contacts,
        properties,
        seen,
      }),
    [feed.matches, feed.messagesByMatch, contacts, properties, seen],
  );

  const agentName = profileById(currentUserId)?.full_name ?? "";
  const horario = autoConfig.hoursText.trim() || summarizeHours(autoConfig.hours);
  useAutomationRunner({
    agencyId: agency.id,
    userId: currentUserId,
    ready: !feed.loading && !feed.error && feed.agencyId === agency.id,
    paused: autoConfig.paused,
    rules: autoConfig.rules,
    hours: autoConfig.hours,
    conversations: all,
    messagesByMatch: feed.messagesByMatch,
    renderContext: (c) => buildTemplateContext(c, { agencyName: agency.name, agentName, horario }),
  });

  const base = useMemo(() => (agentId ? all.filter((c) => c.agentId === agentId) : all), [all, agentId]);
  const counts = {
    todas: base.length,
    no_leidas: base.filter((c) => c.unread).length,
    app: base.filter((c) => c.channel === "app").length,
  };
  const unanswered = all.filter((c) => c.unanswered).length;
  const activeLeads = opportunities.filter((o) => o.stage !== "cierre" && o.stage !== "perdida" && !o.closed_at).length;

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return base.filter((c) => {
      if (tab === "no_leidas" && !c.unread) return false;
      if (tab === "app" && c.channel !== "app") return false;
      if (!q) return true;
      return norm(`${c.name} ${c.property?.title ?? ""} ${c.last?.content ?? ""}`).includes(q);
    });
  }, [base, tab, query]);

  // Canales externos (WhatsApp / Instagram / Messenger): ver channels/.
  const ch = useInboxChannels({ appVisible: visible, tab, query, agentId, selectedId });

  // En pantallas anchas arranca con la primera conversación abierta; en celular se espera a que elijan.
  useEffect(() => {
    if (selectedId || ch.firstId === null) return;
    if (window.matchMedia("(min-width: 768px)").matches) setSelectedId(ch.firstId);
  }, [selectedId, ch.firstId]);

  const selected = all.find((c) => c.id === selectedId) ?? null;
  const crmMatch = useMemo(
    () =>
      selected?.contact && selected.property
        ? matches.find(
            (m) => m.contact_id === selected.contact!.id && m.property_id === selected.property!.id && !m.is_dismissed,
          )
        : undefined,
    [matches, selected],
  );
  const selectedMatchId = selected?.matchId;
  const onSeen = useCallback((iso: string) => selectedMatchId && mark(selectedMatchId, iso), [selectedMatchId, mark]);

  const tabs: { value: Tab; label: string }[] = [
    { value: "todas", label: `Todas ${counts.todas + ch.all.length}` },
    { value: "no_leidas", label: `No leídas ${counts.no_leidas + ch.unread}` },
    { value: "app", label: `App ${counts.app}` },
  ];

  const pane = "min-h-0 border-r overflow-hidden";

  return (
    <>
      <AppHeader
        breadcrumb={["Centro de comunicaciones"]}
        title="Inbox de conversaciones"
        subtitle="Respondé a quienes te escriben desde la app, con la ficha del comprador al lado."
      >
        <div className="flex gap-2">
          <Kpi label="Conversaciones" value={all.length + ch.all.length} />
          <Kpi label="Sin responder" value={unanswered} />
          <Kpi label="Leads activos" value={activeLeads} />
        </div>
      </AppHeader>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-8 py-3 border-b flex-shrink-0" style={{ borderColor: "#E9E5DE" }}>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#F7F0FF" }} role="group" aria-label="Filtrar conversaciones">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              aria-pressed={tab === t.value}
              className="rounded-lg text-sm px-3.5 min-h-[40px] md:min-h-[32px] whitespace-nowrap"
              style={
                tab === t.value
                  ? { background: "var(--gradient-brand)", color: "white", fontWeight: 600 }
                  : { color: "#6B7280", fontWeight: 500 }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <SourceFilter
          value={ch.source}
          onChange={ch.setSource}
          appCount={visible.length}
          channelConversations={ch.all}
          channelsConfigured={ch.configured}
        />

        <div className="flex items-center gap-2 ml-auto w-full md:w-auto">
          <button
            onClick={() => setAutoOpen(true)}
            className="min-h-[44px] md:min-h-[40px] px-4 rounded-xl text-sm border whitespace-nowrap flex items-center gap-2 hover:border-violet-300"
            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", background: "#FAF8F5", fontWeight: 600 }}
          >
            Automatizaciones
            {autoConfig.paused ? (
              <span className="text-[11px] px-1.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 700 }}>
                En pausa
              </span>
            ) : (
              autoConfig.rules.some((r) => r.enabled) && (
                <span className="text-[11px] px-1.5 rounded-full" style={{ background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>
                  {autoConfig.rules.filter((r) => r.enabled).length} activas
                </span>
              )
            )}
          </button>
          {profiles.length > 1 && (
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              aria-label="Filtrar por agente"
              className="min-h-[44px] md:min-h-[40px] px-3 rounded-xl text-sm border bg-white"
              style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
            >
              <option value="">Todos los agentes</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          )}
          <label
            className="flex items-center gap-2 px-4 min-h-[44px] md:min-h-[40px] rounded-xl text-sm focus-within:ring-2 focus-within:ring-[#9B21FF] flex-1 md:w-[260px] md:flex-none"
            style={{ background: "#F7F0FF" }}
          >
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar por nombre, propiedad o mensaje"
              placeholder="Buscar conversaciones…"
              className="bg-transparent outline-none w-full text-[#1A1A1A] placeholder:text-[#6B7280]"
            />
          </label>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_340px]">
        <div className={`${view === "list" ? "block" : "hidden"} md:block ${pane} overflow-y-auto`} style={{ borderColor: "#E9E5DE" }}>
          <UnifiedConversationList
            appItems={ch.appItems}
            channelItems={ch.channelItems}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setView("chat");
            }}
            loading={feed.loading}
            error={feed.error}
            hasAny={all.length + ch.all.length > 0}
          />
        </div>

        <div
          className={`${view === "chat" ? "block" : "hidden"} ${view === "profile" ? "md:hidden xl:block" : "md:block"} ${pane}`}
          style={{ borderColor: "#E9E5DE" }}
        >
          {selected ? (
            <ChatView
              key={selected.matchId}
              conversation={selected}
              preview={feed.messagesByMatch[selected.matchId] ?? []}
              currentUserId={currentUserId}
              responsible={profileById(selected.agentId)}
              crmMatch={crmMatch}
              onBack={() => setView("list")}
              onProfile={() => setView("profile")}
              onSeen={onSeen}
            />
          ) : ch.selected ? (
            <ChannelChatView
              key={ch.selected.id}
              conversation={ch.selected}
              onBack={() => setView("list")}
              onProfile={() => setView("profile")}
            />
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-center">
              <p className="text-sm" style={{ color: "#6B7280" }}>
                Elegí una conversación de la bandeja para verla acá.
              </p>
            </div>
          )}
        </div>

        <div className={`${view === "profile" ? "block" : "hidden"} xl:block min-h-0 overflow-hidden`}>
          {selected ? (
            <ProfilePanel conversation={selected} crmMatch={crmMatch} onBack={() => setView("chat")} />
          ) : ch.selected ? (
            <ChannelProfilePanel conversation={ch.selected} onBack={() => setView("chat")} />
          ) : (
            <div className="p-4">
              <Card padded>
                <p className="text-xs text-center" style={{ color: "#6B7280" }}>
                  Acá vas a ver el perfil del comprador.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>

      <AutomationsDrawer
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        agencyId={agency.id}
        agencyName={agency.name}
        agentName={agentName}
        conversations={all}
        properties={properties}
      />
    </>
  );
}
