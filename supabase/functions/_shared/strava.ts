import { createClient } from "npm:@supabase/supabase-js@2";

const streamKeys = [
  "time",
  "distance",
  "latlng",
  "altitude",
  "heartrate",
  "cadence",
  "watts",
  "velocity_smooth",
  "temp",
  "moving",
  "grade_smooth",
];

type StravaTokenContext = {
  accessToken: string;
  athleteId: number;
  supabase: ReturnType<typeof createClient>;
};

type ImportStravaActivityResult = {
  ok: true;
  activityId: number;
  activityName: string | null;
  sportType: string | null;
  streamsSaved: boolean;
  streamKeysFound: string[];
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function safeStravaError(prefix: string, status: number) {
  return new Error(`${prefix}. Strava responded with status ${status}`);
}

// Returns a usable Strava access token, refreshing and saving it when needed.
export async function getValidStravaAccessToken(): Promise<StravaTokenContext> {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = getRequiredEnv("STRAVA_CLIENT_ID");
  const clientSecret = getRequiredEnv("STRAVA_CLIENT_SECRET");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: connection, error } = await supabase
    .from("strava_connection")
    .select("*")
    .limit(1)
    .single();

  if (error || !connection) {
    throw new Error("No Strava connection found");
  }

  const now = Math.floor(Date.now() / 1000);

  if (connection.expires_at > now + 60) {
    return {
      accessToken: connection.access_token,
      athleteId: connection.strava_athlete_id,
      supabase,
    };
  }

  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }),
  });

  if (!refreshRes.ok) {
    throw safeStravaError("Failed to refresh Strava token", refreshRes.status);
  }

  const refreshJson = await refreshRes.json();
  const { error: updateError } = await supabase
    .from("strava_connection")
    .update({
      access_token: refreshJson.access_token,
      refresh_token: refreshJson.refresh_token,
      expires_at: refreshJson.expires_at,
      scope: refreshJson.scope ?? connection.scope,
    })
    .eq("id", connection.id);

  if (updateError) {
    throw new Error(`Failed to update refreshed token: ${updateError.message}`);
  }

  return {
    accessToken: refreshJson.access_token,
    athleteId: connection.strava_athlete_id,
    supabase,
  };
}

// Imports one Strava activity and, optionally, its streams into Supabase.
export async function importStravaActivity(
  activityId: number,
  includeStreams = true,
): Promise<ImportStravaActivityResult> {
  const { accessToken, athleteId, supabase } =
    await getValidStravaAccessToken();

  const detailRes = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!detailRes.ok) {
    throw safeStravaError("Failed to fetch Strava activity", detailRes.status);
  }

  const activity = await detailRes.json();
  const { error: upsertActivityError } = await supabase
    .from("activities")
    .upsert(
      {
        id: activity.id,
        strava_athlete_id: athleteId,
        name: activity.name ?? null,
        sport_type: activity.sport_type ?? null,
        type: activity.type ?? null,
        start_date: activity.start_date ?? null,
        start_date_local: activity.start_date_local ?? null,
        timezone: activity.timezone ?? null,
        distance: activity.distance ?? null,
        moving_time: activity.moving_time ?? null,
        elapsed_time: activity.elapsed_time ?? null,
        total_elevation_gain: activity.total_elevation_gain ?? null,
        average_speed: activity.average_speed ?? null,
        max_speed: activity.max_speed ?? null,
        average_heartrate: activity.average_heartrate ?? null,
        max_heartrate: activity.max_heartrate ?? null,
        average_cadence: activity.average_cadence ?? null,
        average_watts: activity.average_watts ?? null,
        max_watts: activity.max_watts ?? null,
        kilojoules: activity.kilojoules ?? null,
        calories: activity.calories ?? null,
        trainer: activity.trainer ?? false,
        commute: activity.commute ?? false,
        manual: activity.manual ?? false,
        private: activity.private ?? false,
        flagged: activity.flagged ?? false,
        gear_id: activity.gear_id ?? null,
        raw: activity,
        synced_at: new Date().toISOString(),
      },
      {
        onConflict: "id",
      },
    );

  if (upsertActivityError) {
    throw new Error(`Failed to upsert activity: ${upsertActivityError.message}`);
  }

  let streamsSaved = false;
  let streamKeysFound: string[] = [];

  if (includeStreams) {
    const streamsUrl =
      `https://www.strava.com/api/v3/activities/${activityId}/streams?` +
      new URLSearchParams({
        keys: streamKeys.join(","),
        key_by_type: "true",
      }).toString();

    const streamsRes = await fetch(streamsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!streamsRes.ok) {
      throw safeStravaError("Failed to fetch Strava streams", streamsRes.status);
    }

    const streamsJson = await streamsRes.json();
    streamKeysFound = Object.keys(streamsJson ?? {});

    const { error: upsertStreamsError } = await supabase
      .from("activity_streams")
      .upsert(
        {
          activity_id: activityId,
          raw: streamsJson,
          synced_at: new Date().toISOString(),
        },
        {
          onConflict: "activity_id",
        },
      );

    if (upsertStreamsError) {
      throw new Error(`Failed to upsert streams: ${upsertStreamsError.message}`);
    }

    streamsSaved = true;
  }

  return {
    ok: true,
    activityId: activity.id,
    activityName: activity.name ?? null,
    sportType: activity.sport_type ?? null,
    streamsSaved,
    streamKeysFound,
  };
}
