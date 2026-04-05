// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from "npm:@supabase/supabase-js@2";
export async function getValidStravaAccessToken() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!clientId) throw new Error("Missing STRAVA_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing STRAVA_CLIENT_SECRET");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: connection, error } = await supabase.from("strava_connection").select("*").limit(1).single();
  if (error || !connection) {
    throw new Error("No Strava connection found");
  }
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at > now + 60) {
    return {
      accessToken: connection.access_token,
      athleteId: connection.strava_athlete_id,
      supabase
    };
  }
  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token
    })
  });
  const refreshJson = await refreshRes.json();
  if (!refreshRes.ok) {
    throw new Error(`Failed to refresh token: ${JSON.stringify(refreshJson)}`);
  }
  const { error: updateError } = await supabase.from("strava_connection").update({
    access_token: refreshJson.access_token,
    refresh_token: refreshJson.refresh_token,
    expires_at: refreshJson.expires_at,
    scope: refreshJson.scope ?? connection.scope
  }).eq("id", connection.id);
  if (updateError) {
    throw new Error(`Failed to update refreshed token: ${updateError.message}`);
  }
  return {
    accessToken: refreshJson.access_token,
    athleteId: connection.strava_athlete_id,
    supabase
  };
}
