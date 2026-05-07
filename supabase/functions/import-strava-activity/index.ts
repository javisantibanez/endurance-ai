import { getValidStravaAccessToken } from "./strava.ts";
Deno.serve(async (req)=>{
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405
      });
    }
    const { activityId, includeStreams = true } = await req.json();
    if (!activityId) {
      return Response.json({
        error: "Missing activityId"
      }, {
        status: 400
      });
    }
    const { accessToken, athleteId, supabase } = await getValidStravaAccessToken();
    const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const detailJson = await detailRes.json();
    if (!detailRes.ok) {
      return Response.json({
        error: detailJson
      }, {
        status: detailRes.status
      });
    }
    const activity = detailJson;
    const { error: upsertActivityError } = await supabase.from("activities").upsert({
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
      synced_at: new Date().toISOString()
    }, {
      onConflict: "id"
    });
    if (upsertActivityError) {
      return Response.json({
        error: upsertActivityError
      }, {
        status: 500
      });
    }
    let streamsSaved = false;
    let streamKeysFound = [];
    if (includeStreams) {
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
        "grade_smooth"
      ];
      const streamsUrl = `https://www.strava.com/api/v3/activities/${activityId}/streams?` + new URLSearchParams({
        keys: streamKeys.join(","),
        key_by_type: "true"
      }).toString();
      const streamsRes = await fetch(streamsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      const streamsJson = await streamsRes.json();
      if (streamsRes.ok) {
        streamKeysFound = Object.keys(streamsJson ?? {});
        const { error: upsertStreamsError } = await supabase.from("activity_streams").upsert({
          activity_id: activityId,
          raw: streamsJson,
          synced_at: new Date().toISOString()
        }, {
          onConflict: "activity_id"
        });
        if (upsertStreamsError) {
          return Response.json({
            error: upsertStreamsError
          }, {
            status: 500
          });
        }
        streamsSaved = true;
      }
    }
    return Response.json({
      ok: true,
      activityId: activity.id,
      activityName: activity.name,
      sportType: activity.sport_type,
      streamsSaved,
      streamKeysFound
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 500
    });
  }
});
