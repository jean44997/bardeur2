import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfileTool from "./tools/get-my-profile";
import searchProfilesTool from "./tools/search-profiles";
import listMyConversationsTool from "./tools/list-my-conversations";
import listRecentNotificationsTool from "./tools/list-recent-notifications";

// Direct Supabase issuer, built from the project ref (inlined by Vite at build).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bardeur-yk-mcp",
  title: "BARDEUR YK",
  version: "0.1.0",
  instructions:
    "Tools for the BARDEUR YK social app. Use these to read the signed-in user's profile, search other profiles, list their conversations, and read their recent notifications. All access is scoped by row-level security to the connected user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMyProfileTool,
    searchProfilesTool,
    listMyConversationsTool,
    listRecentNotificationsTool,
  ],
});
