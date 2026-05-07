import { createClient } from "npm:@supabase/supabase-js@2";
import { importStravaActivity } from "../_shared/strava.ts";

type StravaWebhookPayload = {
  aspect_type: string;
  event_time: number;
  object_id: number;
  object_type: string;
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, unknown>;
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const verifyToken = getRequiredEnv("STRAVA_VERIFY_TOKEN");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Handles Strava subscription verification.
    if (req.method === "GET") {
      const url = new URL(req.url);

      const challenge = url.searchParams.get("hub.challenge");
      const token = url.searchParams.get("hub.verify_token");

      if (token === verifyToken && challenge) {
        return Response.json({ "hub.challenge": challenge });
      }

      return Response.json(
        {
          error: "Invalid webhook verification",
          received: {
            hasChallenge: Boolean(challenge),
            tokenMatches: token === verifyToken,
          },
        },
        { status: 403 },
      );
    }

    // Stores and processes Strava webhook events.
    if (req.method === "POST") {
      const payload = (await req.json()) as StravaWebhookPayload;

      const { data: webhookEvent, error: insertEventError } = await supabase
        .from("webhook_events")
        .insert({
          aspect_type: payload.aspect_type ?? null,
          object_type: payload.object_type ?? null,
          object_id: payload.object_id ?? null,
          owner_id: payload.owner_id ?? null,
          subscription_id: payload.subscription_id ?? null,
          event_time: payload.event_time ?? null,
          payload,
          processed: false,
        })
        .select("id")
        .single();

      if (insertEventError) {
        return Response.json({ error: insertEventError }, { status: 500 });
      }

      if (!webhookEvent?.id) {
        throw new Error("Failed to store webhook event id");
      }

      const markProcessed = async () => {
        const { error } = await supabase
          .from("webhook_events")
          .update({ processed: true, error: null })
          .eq("id", webhookEvent.id);

        if (error) {
          throw error;
        }
      };

      const markFailed = async (error: unknown) => {
        const { error: updateError } = await supabase
          .from("webhook_events")
          .update({ processed: false, error: getErrorMessage(error) })
          .eq("id", webhookEvent.id);

        if (updateError) {
          throw updateError;
        }
      };

      try {
        if (payload.object_type !== "activity") {
          await markProcessed();

          return Response.json({
            ok: true,
            ignored: true,
            reason: "Not an activity event",
          });
        }

        if (payload.aspect_type === "delete") {
          const { error: deleteStreamsError } = await supabase
            .from("activity_streams")
            .delete()
            .eq("activity_id", payload.object_id);

          if (deleteStreamsError) {
            throw deleteStreamsError;
          }

          const { error: deleteActivityError } = await supabase
            .from("activities")
            .delete()
            .eq("id", payload.object_id);

          if (deleteActivityError) {
            throw deleteActivityError;
          }

          await markProcessed();

          return Response.json({
            ok: true,
            action: "deleted",
            activityId: payload.object_id,
          });
        }

        if (
          payload.aspect_type === "create" ||
          payload.aspect_type === "update"
        ) {
          const importResult = await importStravaActivity(
            payload.object_id,
            true,
          );

          await markProcessed();

          return Response.json({
            ok: true,
            action: payload.aspect_type,
            activityId: payload.object_id,
            importResult,
          });
        }

        await markProcessed();

        return Response.json({
          ok: true,
          ignored: true,
          reason: "Unhandled aspect_type",
        });
      } catch (error) {
        await markFailed(error);

        return Response.json(
          { ok: false, error: getErrorMessage(error) },
          { status: 500 },
        );
      }
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
});
