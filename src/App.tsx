import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowLeft,
  Bike,
  Clock3,
  Gauge,
  HeartPulse,
  Mountain,
  RefreshCw,
  Route,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";
import Header from "./components/Header";
import SideBar from "./components/SideBar";
import { Button } from "./components/ui/button";
import { createClient } from "./lib/supabase/client";

type Section = "Resumen" | "Análisis" | "Historia" | "Actividades";
type TrainingGroup = "Run" | "Bici" | "Pesas" | "Otros";
type AnalysisFilter = "Todos" | TrainingGroup;
type RealtimeStatus = "connecting" | "connected" | "error";

type ActivityRow = {
  id: number;
  name: string | null;
  sport_type: string | null;
  type: string | null;
  start_date: string | null;
  start_date_local: string | null;
  distance: number | null;
  moving_time: number | null;
  elapsed_time: number | null;
  total_elevation_gain: number | null;
  average_speed: number | null;
  max_speed: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_watts: number | null;
  max_watts: number | null;
  kilojoules: number | null;
  calories: number | null;
  trainer: boolean | null;
  manual: boolean | null;
  synced_at: string | null;
};

type StreamValue = {
  data?: unknown;
};

type ActivityStreamRaw = Record<string, StreamValue | number[] | unknown>;

type ActivityStreamRow = {
  activity_id: number;
  raw: ActivityStreamRaw | null;
  synced_at: string | null;
};

type StreamChartPoint = {
  index: number;
  timeSeconds: number;
  timeLabel: string;
  distanceKm: number | null;
  heartRate: number | null;
  speedKmh: number | null;
  paceMinKm: number | null;
  altitude: number | null;
};

type WeeklyPoint = {
  week: string;
  distanceKm: number;
  hours: number;
  activities: number;
};

const groupColors: Record<TrainingGroup, string> = {
  Run: "#2563eb",
  Bici: "#0f766e",
  Pesas: "#b45309",
  Otros: "#7f1d1d",
};

const activityColumns = [
  "id",
  "name",
  "sport_type",
  "type",
  "start_date",
  "start_date_local",
  "distance",
  "moving_time",
  "elapsed_time",
  "total_elevation_gain",
  "average_speed",
  "max_speed",
  "average_heartrate",
  "max_heartrate",
  "average_watts",
  "max_watts",
  "kilojoules",
  "calories",
  "trainer",
  "manual",
  "synced_at",
].join(",");

const metersToKm = (value: number | null) => (value ?? 0) / 1000;
const secondsToHours = (value: number | null) => (value ?? 0) / 3600;
const metersPerSecondToKmh = (value: number | null) => (value ?? 0) * 3.6;
const metersPerSecondToPace = (value: number | null) => {
  if (!value) return "-";

  const minutesByKm = 1000 / value / 60;
  const minutes = Math.floor(minutesByKm);
  const seconds = Math.round((minutesByKm - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
};

const formatDuration = (value: number | null) => {
  const totalSeconds = Math.max(0, Math.round(value ?? 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);

const formatDate = (value: string | null) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const getTrainingGroup = (activity: ActivityRow): TrainingGroup => {
  const sport = `${activity.sport_type ?? ""} ${activity.type ?? ""}`.toLowerCase();

  if (sport.includes("run")) return "Run";
  if (
    sport.includes("ride") ||
    sport.includes("bike") ||
    sport.includes("cycling")
  ) {
    return "Bici";
  }
  if (
    sport.includes("weight") ||
    sport.includes("strength") ||
    sport.includes("workout")
  ) {
    return "Pesas";
  }

  return "Otros";
};

const getWeekKey = (value: string | null) => {
  const date = value ? new Date(value) : new Date();
  const day = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() - day + 1);

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
  }).format(date);
};

function App() {
  const [selected, setSelected] = useState<Section>("Resumen");
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<number | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("connecting");

  const loadActivities = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("activities")
        .select(activityColumns)
        .order("start_date_local", { ascending: false });

      if (error) throw error;

      setActivities((data ?? []) as unknown as ActivityRow[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openActivityDetail = useCallback((activity: ActivityRow) => {
    setSelectedActivityId(activity.id);
    setSelected("Actividades");
  }, []);

  const deleteActivity = useCallback(async (activity: ActivityRow) => {
    const activityName = activity.name ?? "este entrenamiento";
    const shouldDelete = window.confirm(
      `¿Eliminar "${activityName}"? Esta acción también borrará la actividad de Supabase.`
    );

    if (!shouldDelete) return;

    setDeletingActivityId(activity.id);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error: deleteStreamsError } = await supabase
        .from("activity_streams")
        .delete()
        .eq("activity_id", activity.id);

      if (deleteStreamsError) throw deleteStreamsError;

      const { error: deleteActivityError } = await supabase
        .from("activities")
        .delete()
        .eq("id", activity.id);

      if (deleteActivityError) throw deleteActivityError;

      setActivities((currentActivities) =>
        currentActivities.filter((currentActivity) => currentActivity.id !== activity.id)
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingActivityId(null);
    }
  }, []);

  useEffect(() => {
    void loadActivities();

    try {
      const supabase = createClient();
      const channel = supabase
        .channel("dashboard-activities")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "activities" },
          () => {
            void loadActivities({ silent: true });
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setRealtimeStatus("connected");
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setRealtimeStatus("error");
            return;
          }

          setRealtimeStatus("connecting");
        });

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch (error) {
      setRealtimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [loadActivities]);

  const content = {
    Resumen: (
      <SummaryDashboard
        activities={activities}
        errorMessage={errorMessage}
        isLoading={isLoading}
        realtimeStatus={realtimeStatus}
        onRefresh={loadActivities}
        onDeleteActivity={deleteActivity}
        onOpenActivity={openActivityDetail}
        deletingActivityId={deletingActivityId}
      />
    ),
    Análisis: (
      <TrainingAnalysis
        activities={activities}
        errorMessage={errorMessage}
        isLoading={isLoading}
        realtimeStatus={realtimeStatus}
        onRefresh={loadActivities}
        onDeleteActivity={deleteActivity}
        onOpenActivity={openActivityDetail}
        deletingActivityId={deletingActivityId}
      />
    ),
    Historia: <EmptyState title="Historia" text="Próximamente: línea de tiempo y ciclos." />,
    Actividades: (
      <ActivitiesSection
        activities={activities}
        errorMessage={errorMessage}
        isLoading={isLoading}
        realtimeStatus={realtimeStatus}
        selectedActivityId={selectedActivityId}
        onRefresh={loadActivities}
        onDeleteActivity={deleteActivity}
        onOpenActivity={openActivityDetail}
        onBackToList={() => setSelectedActivityId(null)}
        deletingActivityId={deletingActivityId}
      />
    ),
  } satisfies Record<Section, ReactNode>;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <Header />
      <div className="flex">
        <SideBar selected={selected} onSelect={setSelected} />
        <main className="min-w-0 flex-1 p-6">
          {content[selected]}
        </main>
      </div>
    </div>
  );
}

function SummaryDashboard({
  activities,
  errorMessage,
  isLoading,
  realtimeStatus,
  onRefresh,
  onDeleteActivity,
  onOpenActivity,
  deletingActivityId,
}: {
  activities: ActivityRow[];
  errorMessage: string | null;
  isLoading: boolean;
  realtimeStatus: RealtimeStatus;
  onRefresh: () => void;
  onDeleteActivity: (activity: ActivityRow) => void;
  onOpenActivity: (activity: ActivityRow) => void;
  deletingActivityId: number | null;
}) {
  const summary = useMemo(() => getSummaryData(activities), [activities]);

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Resumen"
        subtitle="Carga, volumen y distribución reciente de entrenamientos."
        isLoading={isLoading}
        realtimeStatus={realtimeStatus}
        onRefresh={onRefresh}
      />

      <StatusMessage
        activityCount={activities.length}
        errorMessage={errorMessage}
        isLoading={isLoading}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Entrenamientos"
          value={formatNumber(summary.totalActivities)}
          tone="bg-blue-50 text-blue-700"
        />
        <MetricCard
          icon={Route}
          label="Distancia"
          value={`${formatNumber(summary.totalDistanceKm, 1)} km`}
          tone="bg-teal-50 text-teal-700"
        />
        <MetricCard
          icon={Clock3}
          label="Tiempo activo"
          value={`${formatNumber(summary.totalHours, 1)} h`}
          tone="bg-amber-50 text-amber-700"
        />
        <MetricCard
          icon={Mountain}
          label="Desnivel"
          value={`${formatNumber(summary.totalElevation)} m`}
          tone="bg-rose-50 text-rose-700"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Panel title="Volumen semanal">
          {summary.weekly.length > 0 ? (
            <div className="min-w-0">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <AreaChart data={summary.weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="distanceKm"
                    name="Distancia km"
                    stroke="#2563eb"
                    fill="#bfdbfe"
                  />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    name="Horas"
                    stroke="#0f766e"
                    fill="#99f6e4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty />
          )}
        </Panel>

        <Panel title="Distribución por tipo">
          {summary.totalActivities > 0 ? (
            <div className="min-w-0">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <PieChart>
                  <Pie
                    data={summary.byGroup}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={64}
                    outerRadius={104}
                    paddingAngle={3}
                  >
                    {summary.byGroup.map((entry) => (
                      <Cell key={entry.name} fill={groupColors[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty />
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {summary.byGroup.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: groupColors[entry.name] }}
                />
                <span className="text-zinc-600">{entry.name}</span>
                <span className="font-semibold">{entry.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Últimos entrenamientos">
        <ActivityTable
          activities={activities.slice(0, 8)}
          compact
          onDeleteActivity={onDeleteActivity}
          onOpenActivity={onOpenActivity}
          deletingActivityId={deletingActivityId}
        />
      </Panel>
    </section>
  );
}

function TrainingAnalysis({
  activities,
  errorMessage,
  isLoading,
  realtimeStatus,
  onRefresh,
  onDeleteActivity,
  onOpenActivity,
  deletingActivityId,
}: {
  activities: ActivityRow[];
  errorMessage: string | null;
  isLoading: boolean;
  realtimeStatus: RealtimeStatus;
  onRefresh: () => void;
  onDeleteActivity: (activity: ActivityRow) => void;
  onOpenActivity: (activity: ActivityRow) => void;
  deletingActivityId: number | null;
}) {
  const [filter, setFilter] = useState<AnalysisFilter>("Todos");
  const filteredActivities = useMemo(
    () =>
      filter === "Todos"
        ? activities
        : activities.filter((activity) => getTrainingGroup(activity) === filter),
    [activities, filter]
  );
  const summary = useMemo(() => getSummaryData(filteredActivities), [filteredActivities]);
  const filters: AnalysisFilter[] = ["Todos", "Run", "Bici", "Pesas", "Otros"];

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Análisis"
        subtitle="Detalle general de todos los entrenamientos registrados."
        isLoading={isLoading}
        realtimeStatus={realtimeStatus}
        onRefresh={onRefresh}
      />

      <StatusMessage
        activityCount={activities.length}
        errorMessage={errorMessage}
        isLoading={isLoading}
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button
            key={item}
            variant={filter === item ? "default" : "outline"}
            onClick={() => setFilter(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={TrendingUp}
          label="Sesiones"
          value={formatNumber(summary.totalActivities)}
          tone="bg-blue-50 text-blue-700"
        />
        <MetricCard
          icon={Gauge}
          label="Ritmo promedio"
          value={metersPerSecondToPace(summary.averageSpeed)}
          tone="bg-teal-50 text-teal-700"
        />
        <MetricCard
          icon={HeartPulse}
          label="FC promedio"
          value={summary.averageHeartRate ? `${formatNumber(summary.averageHeartRate)} ppm` : "-"}
          tone="bg-rose-50 text-rose-700"
        />
        <MetricCard
          icon={Bike}
          label="Potencia promedio"
          value={summary.averageWatts ? `${formatNumber(summary.averageWatts)} W` : "-"}
          tone="bg-amber-50 text-amber-700"
        />
      </div>

      <Panel title="Carga por semana">
        {summary.weekly.length > 0 ? (
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <BarChart data={summary.weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="week" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar
                  dataKey="activities"
                  name="Entrenamientos"
                  fill="#b45309"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="hours" name="Horas" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmpty />
        )}
      </Panel>

      <Panel title="Detalle de entrenamientos">
        <ActivityTable
          activities={filteredActivities}
          onDeleteActivity={onDeleteActivity}
          onOpenActivity={onOpenActivity}
          deletingActivityId={deletingActivityId}
        />
      </Panel>
    </section>
  );
}

function ActivitiesSection({
  activities,
  errorMessage,
  isLoading,
  realtimeStatus,
  selectedActivityId,
  onRefresh,
  onDeleteActivity,
  onOpenActivity,
  onBackToList,
  deletingActivityId,
}: {
  activities: ActivityRow[];
  errorMessage: string | null;
  isLoading: boolean;
  realtimeStatus: RealtimeStatus;
  selectedActivityId: number | null;
  onRefresh: () => void;
  onDeleteActivity: (activity: ActivityRow) => void;
  onOpenActivity: (activity: ActivityRow) => void;
  onBackToList: () => void;
  deletingActivityId: number | null;
}) {
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId);

  if (selectedActivityId && selectedActivity) {
    return (
      <ActivityDetail
        activity={selectedActivity}
        onBack={onBackToList}
        onDeleteActivity={onDeleteActivity}
        deletingActivityId={deletingActivityId}
      />
    );
  }

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Actividades"
        subtitle="Lista completa de entrenamientos sincronizados. Selecciona una actividad para ver sus streams."
        isLoading={isLoading}
        realtimeStatus={realtimeStatus}
        onRefresh={onRefresh}
      />

      <StatusMessage
        activityCount={activities.length}
        errorMessage={errorMessage}
        isLoading={isLoading}
      />

      <Panel title="Actividades">
        <ActivityTable
          activities={activities}
          onDeleteActivity={onDeleteActivity}
          onOpenActivity={onOpenActivity}
          deletingActivityId={deletingActivityId}
        />
      </Panel>
    </section>
  );
}

function ActivityDetail({
  activity,
  onBack,
  onDeleteActivity,
  deletingActivityId,
}: {
  activity: ActivityRow;
  onBack: () => void;
  onDeleteActivity: (activity: ActivityRow) => void;
  deletingActivityId: number | null;
}) {
  const [streamRow, setStreamRow] = useState<ActivityStreamRow | null>(null);
  const [isLoadingStreams, setIsLoadingStreams] = useState(true);
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStreams() {
      setIsLoadingStreams(true);
      setStreamErrorMessage(null);

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("activity_streams")
          .select("activity_id,raw,synced_at")
          .eq("activity_id", activity.id)
          .maybeSingle();

        if (error) throw error;
        if (isMounted) setStreamRow((data ?? null) as ActivityStreamRow | null);
      } catch (error) {
        if (isMounted) {
          setStreamErrorMessage(error instanceof Error ? error.message : String(error));
          setStreamRow(null);
        }
      } finally {
        if (isMounted) setIsLoadingStreams(false);
      }
    }

    void loadStreams();

    return () => {
      isMounted = false;
    };
  }, [activity.id]);

  const streamPoints = useMemo(
    () => buildStreamChartPoints(streamRow?.raw ?? null),
    [streamRow]
  );
  const hasStreams = streamPoints.length > 0;
  const isDeleting = deletingActivityId === activity.id;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" onClick={onBack} className="mb-3 pl-0">
            <ArrowLeft />
            Actividades
          </Button>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            {activity.name ?? "Entrenamiento sin nombre"}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {formatDate(activity.start_date_local ?? activity.start_date)} ·{" "}
            {getTrainingGroup(activity)}
          </p>
        </div>
        <Button
          variant="destructive"
          disabled={isDeleting}
          onClick={() => onDeleteActivity(activity)}
        >
          {isDeleting ? <RefreshCw className="animate-spin" /> : <Trash2 />}
          Eliminar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Route}
          label="Distancia"
          value={`${formatNumber(metersToKm(activity.distance), 1)} km`}
          tone="bg-blue-50 text-blue-700"
        />
        <MetricCard
          icon={Clock3}
          label="Tiempo activo"
          value={formatDuration(activity.moving_time)}
          tone="bg-teal-50 text-teal-700"
        />
        <MetricCard
          icon={Mountain}
          label="Desnivel"
          value={`${formatNumber(activity.total_elevation_gain ?? 0)} m`}
          tone="bg-amber-50 text-amber-700"
        />
        <MetricCard
          icon={HeartPulse}
          label="FC promedio"
          value={activity.average_heartrate ? `${formatNumber(activity.average_heartrate)} ppm` : "-"}
          tone="bg-rose-50 text-rose-700"
        />
      </div>

      {streamErrorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {streamErrorMessage}
        </div>
      )}

      {isLoadingStreams ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          Cargando streams de la actividad...
        </div>
      ) : hasStreams ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Frecuencia cardíaca vs tiempo">
            <StreamLineChart
              data={streamPoints}
              dataKey="heartRate"
              xKey="timeLabel"
              name="FC ppm"
              stroke="#be123c"
              emptyText="No hay stream de frecuencia cardíaca para esta actividad."
            />
          </Panel>

          <Panel title="Velocidad y ritmo vs tiempo">
            <SpeedPaceChart data={streamPoints} />
          </Panel>

          <Panel title="Altitud vs distancia">
            <StreamLineChart
              data={streamPoints}
              dataKey="altitude"
              xKey="distanceKm"
              name="Altitud m"
              stroke="#b45309"
              emptyText="No hay stream de altitud o distancia para esta actividad."
              xFormatter={(value) => `${formatNumber(Number(value), 1)} km`}
            />
          </Panel>
        </div>
      ) : (
        <ChartEmpty text="No hay streams visibles para esta actividad. Si existen filas en public.activity_streams, revisa que el frontend tenga una policy SELECT para esa tabla." />
      )}
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
  isLoading,
  realtimeStatus,
  onRefresh,
}: {
  title: string;
  subtitle: string;
  isLoading: boolean;
  realtimeStatus: RealtimeStatus;
  onRefresh: () => void;
}) {
  const statusConfig = {
    connecting: {
      label: "Conectando",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    connected: {
      label: "En vivo",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    error: {
      label: "Sin tiempo real",
      className: "border-red-200 bg-red-50 text-red-700",
    },
  } satisfies Record<RealtimeStatus, { label: string; className: string }>;
  const status = statusConfig[realtimeStatus];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">{title}</h1>
          <span
            className={`rounded-md border px-2 py-1 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
      </div>
      <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
        <RefreshCw className={isLoading ? "animate-spin" : ""} />
        Actualizar
      </Button>
    </div>
  );
}

function StatusMessage({
  activityCount,
  errorMessage,
  isLoading,
}: {
  activityCount: number;
  errorMessage: string | null;
  isLoading: boolean;
}) {
  if (errorMessage) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {errorMessage}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
        Cargando datos de Supabase...
      </div>
    );
  }

  if (activityCount === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No hay actividades visibles para la publishable key del frontend. Si la tabla tiene
        filas, revisa la policy SELECT de RLS para public.activities.
      </div>
    );
  }

  return null;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ElementType;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-md ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-base font-semibold tracking-normal text-zinc-950">{title}</h2>
      {children}
    </section>
  );
}

function ChartEmpty({
  text = "No hay datos suficientes para graficar.",
}: {
  text?: string;
}) {
  return (
    <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-zinc-300 px-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

function StreamLineChart({
  data,
  dataKey,
  xKey,
  name,
  stroke,
  emptyText,
  xFormatter,
}: {
  data: StreamChartPoint[];
  dataKey: keyof StreamChartPoint;
  xKey: keyof StreamChartPoint;
  name: string;
  stroke: string;
  emptyText: string;
  xFormatter?: (value: string | number) => string;
}) {
  const chartData = data.filter(
    (point) => point[dataKey] !== null && point[xKey] !== null
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-zinc-300 px-6 text-center text-sm text-zinc-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={300} minWidth={0}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              xFormatter ? xFormatter(value as string | number) : String(value)
            }
          />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => formatNumber(Number(value), 1)}
            labelFormatter={(value) =>
              xFormatter ? xFormatter(value as string | number) : String(value)
            }
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpeedPaceChart({ data }: { data: StreamChartPoint[] }) {
  const chartData = data.filter(
    (point) => point.speedKmh !== null || point.paceMinKm !== null
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-zinc-300 px-6 text-center text-sm text-zinc-500">
        No hay stream de velocidad para esta actividad.
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={300} minWidth={0}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="timeLabel" tickLine={false} axisLine={false} />
          <YAxis yAxisId="speed" tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="pace"
            orientation="right"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip formatter={(value) => formatNumber(Number(value), 1)} />
          <Line
            yAxisId="speed"
            type="monotone"
            dataKey="speedKmh"
            name="Velocidad km/h"
            stroke="#0f766e"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="pace"
            type="monotone"
            dataKey="paceMinKm"
            name="Ritmo min/km"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityTable({
  activities,
  compact = false,
  onDeleteActivity,
  onOpenActivity,
  deletingActivityId,
}: {
  activities: ActivityRow[];
  compact?: boolean;
  onDeleteActivity?: (activity: ActivityRow) => void;
  onOpenActivity?: (activity: ActivityRow) => void;
  deletingActivityId?: number | null;
}) {
  if (activities.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No hay entrenamientos para mostrar.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Distancia</th>
            <th className="px-3 py-2 font-medium">Tiempo</th>
            <th className="px-3 py-2 font-medium">Desnivel</th>
            <th className="px-3 py-2 font-medium">Ritmo</th>
            {!compact && <th className="px-3 py-2 font-medium">FC</th>}
            {!compact && <th className="px-3 py-2 font-medium">Watts</th>}
            {!compact && <th className="px-3 py-2 font-medium">Calorías</th>}
            {onDeleteActivity && (
              <th className="px-3 py-2 text-right font-medium">Acciones</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {activities.map((activity) => {
            const isDeleting = deletingActivityId === activity.id;

            return (
              <tr
                key={activity.id}
                className={onOpenActivity ? "cursor-pointer hover:bg-zinc-50" : "hover:bg-zinc-50"}
                onClick={() => onOpenActivity?.(activity)}
              >
                <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                  {formatDate(activity.start_date_local ?? activity.start_date)}
                </td>
                <td className="px-3 py-3 font-medium text-zinc-950">
                  {activity.name ?? "Entrenamiento sin nombre"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className="rounded-md px-2 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: groupColors[getTrainingGroup(activity)] }}
                  >
                    {getTrainingGroup(activity)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                  {formatNumber(metersToKm(activity.distance), 1)} km
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                  {formatNumber(secondsToHours(activity.moving_time), 1)} h
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                  {formatNumber(activity.total_elevation_gain ?? 0)} m
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                  {metersPerSecondToPace(activity.average_speed)}
                </td>
                {!compact && (
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                    {activity.average_heartrate
                      ? `${formatNumber(activity.average_heartrate)} ppm`
                      : "-"}
                  </td>
                )}
                {!compact && (
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                    {activity.average_watts ? `${formatNumber(activity.average_watts)} W` : "-"}
                  </td>
                )}
                {!compact && (
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                    {activity.calories ? formatNumber(activity.calories) : "-"}
                  </td>
                )}
                {onDeleteActivity && (
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`Eliminar ${activity.name ?? "entrenamiento"}`}
                      title="Eliminar entrenamiento"
                      disabled={isDeleting}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteActivity(activity);
                      }}
                    >
                      {isDeleting ? (
                        <RefreshCw className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600">{text}</p>
    </section>
  );
}

function buildStreamChartPoints(raw: ActivityStreamRaw | null): StreamChartPoint[] {
  if (!raw) return [];

  const time = getNumericStream(raw, "time");
  const distance = getNumericStream(raw, "distance");
  const heartRate = getNumericStream(raw, "heartrate");
  const velocity = getNumericStream(raw, "velocity_smooth");
  const altitude = getNumericStream(raw, "altitude");
  const pointCount = Math.max(
    time.length,
    distance.length,
    heartRate.length,
    velocity.length,
    altitude.length
  );

  if (pointCount === 0) return [];

  return Array.from({ length: pointCount }, (_, index) => {
    const timeSeconds = time[index] ?? index;
    const speedMetersPerSecond = velocity[index] ?? null;

    return {
      index,
      timeSeconds,
      timeLabel: formatDuration(timeSeconds),
      distanceKm: typeof distance[index] === "number" ? metersToKm(distance[index]) : null,
      heartRate: heartRate[index] ?? null,
      speedKmh:
        typeof speedMetersPerSecond === "number"
          ? Number(metersPerSecondToKmh(speedMetersPerSecond).toFixed(2))
          : null,
      paceMinKm:
        typeof speedMetersPerSecond === "number" && speedMetersPerSecond > 0
          ? Number((1000 / speedMetersPerSecond / 60).toFixed(2))
          : null,
      altitude: altitude[index] ?? null,
    };
  });
}

function getNumericStream(raw: ActivityStreamRaw, key: string) {
  const stream = raw[key];
  const data = isStreamValue(stream) ? stream.data : stream;

  if (!Array.isArray(data)) return [];

  return data.filter((value): value is number => typeof value === "number");
}

function isStreamValue(value: unknown): value is StreamValue {
  return Boolean(value && typeof value === "object" && "data" in value);
}

function getSummaryData(activities: ActivityRow[]) {
  const totals = activities.reduce(
    (acc, activity) => {
      acc.totalDistanceKm += metersToKm(activity.distance);
      acc.totalHours += secondsToHours(activity.moving_time);
      acc.totalElevation += activity.total_elevation_gain ?? 0;

      if (activity.average_speed) acc.speeds.push(activity.average_speed);
      if (activity.average_heartrate) acc.heartRates.push(activity.average_heartrate);
      if (activity.average_watts) acc.watts.push(activity.average_watts);

      return acc;
    },
    {
      totalDistanceKm: 0,
      totalHours: 0,
      totalElevation: 0,
      speeds: [] as number[],
      heartRates: [] as number[],
      watts: [] as number[],
    }
  );

  const weeklyMap = new Map<string, WeeklyPoint>();
  const sortedAscending = [...activities].sort(
    (a, b) =>
      new Date(a.start_date_local ?? a.start_date ?? 0).getTime() -
      new Date(b.start_date_local ?? b.start_date ?? 0).getTime()
  );

  sortedAscending.forEach((activity) => {
    const week = getWeekKey(activity.start_date_local ?? activity.start_date);
    const point = weeklyMap.get(week) ?? {
      week,
      distanceKm: 0,
      hours: 0,
      activities: 0,
    };

    point.distanceKm += metersToKm(activity.distance);
    point.hours += secondsToHours(activity.moving_time);
    point.activities += 1;
    weeklyMap.set(week, point);
  });

  const groupMap = new Map<TrainingGroup, number>([
    ["Run", 0],
    ["Bici", 0],
    ["Pesas", 0],
    ["Otros", 0],
  ]);

  activities.forEach((activity) => {
    const group = getTrainingGroup(activity);
    groupMap.set(group, (groupMap.get(group) ?? 0) + 1);
  });

  const average = (values: number[]) =>
    values.length > 0
      ? values.reduce((total, value) => total + value, 0) / values.length
      : null;

  return {
    totalActivities: activities.length,
    totalDistanceKm: totals.totalDistanceKm,
    totalHours: totals.totalHours,
    totalElevation: totals.totalElevation,
    averageSpeed: average(totals.speeds),
    averageHeartRate: average(totals.heartRates),
    averageWatts: average(totals.watts),
    weekly: Array.from(weeklyMap.values()).slice(-10).map((point) => ({
      ...point,
      distanceKm: Number(point.distanceKm.toFixed(1)),
      hours: Number(point.hours.toFixed(1)),
    })),
    byGroup: Array.from(groupMap.entries()).map(([name, value]) => ({
      name,
      value,
    })),
  };
}

export default App;
