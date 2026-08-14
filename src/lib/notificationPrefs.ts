export type NotificationType = "all" | "like" | "comment" | "follow" | "message" | "share" | "mention" | "video";
export type NotificationFrequency = "instant" | "batched" | "daily" | "off";

type NotificationProfile = {
  push_notifications?: boolean | null;
  sound_notifications?: boolean | null;
  notify_likes?: boolean | null;
  notify_comments?: boolean | null;
  notify_follows?: boolean | null;
  notify_messages?: boolean | null;
  notify_shares?: boolean | null;
  notify_mentions?: boolean | null;
  notification_sound?: string | null;
  notification_frequency?: string | null;
  dnd_until?: string | null;
  notification_quiet_hours_enabled?: boolean | null;
  notification_quiet_hours_start?: string | null;
  notification_quiet_hours_end?: string | null;
};

const typeToProfileKey: Partial<Record<NotificationType, keyof NotificationProfile>> = {
  like: "notify_likes",
  comment: "notify_comments",
  follow: "notify_follows",
  message: "notify_messages",
  share: "notify_shares",
  mention: "notify_mentions",
};

function minutesFromTime(value?: string | null) {
  const [hours = "0", minutes = "0"] = (value || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function isQuietHoursNow(profile?: NotificationProfile | null, date = new Date()) {
  if (!profile?.notification_quiet_hours_enabled) return false;
  const start = minutesFromTime(profile.notification_quiet_hours_start || "22:00");
  const end = minutesFromTime(profile.notification_quiet_hours_end || "08:00");
  const now = date.getHours() * 60 + date.getMinutes();

  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

/** Manual "Ne pas déranger" timer, stored on the profile so it syncs across devices. */
export function dndRemainingMs(profile?: NotificationProfile | null, now = Date.now()) {
  if (!profile?.dnd_until) return 0;
  const until = new Date(profile.dnd_until).getTime();
  return Number.isNaN(until) ? 0 : Math.max(0, until - now);
}

export function isDndActive(profile?: NotificationProfile | null, date = new Date()) {
  return dndRemainingMs(profile, date.getTime()) > 0 || isQuietHoursNow(profile, date);
}

export function getNotificationFrequency(profile?: NotificationProfile | null): NotificationFrequency {
  const value = (profile?.notification_frequency || "instant") as NotificationFrequency;
  return ["instant", "batched", "daily", "off"].includes(value) ? value : "instant";
}

/** Minimum delay between two visible/audible cues, driven by the frequency preference. */
export function frequencyThrottleMs(profile?: NotificationProfile | null) {
  switch (getNotificationFrequency(profile)) {
    case "off":
      return Number.POSITIVE_INFINITY;
    case "daily":
      return 6 * 60 * 60 * 1000;
    case "batched":
      return 5 * 60 * 1000;
    default:
      return 2500;
  }
}

export function allowsNotificationType(profile: NotificationProfile | null | undefined, type: NotificationType) {
  if (!profile?.push_notifications) return false;
  if (getNotificationFrequency(profile) === "off") return false;
  if (type === "all" || type === "video") return true;
  const key = typeToProfileKey[type];
  return key ? profile[key] !== false : true;
}

export function getNotificationSound(profile?: NotificationProfile | null) {
  return profile?.notification_sound || "pop";
}

/** Rough device capability tier used to scale 3D animations down on weak phones. */
export function getMotionTier(): "low" | "high" {
  if (typeof window === "undefined") return "high";
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const cores = (navigator as any).hardwareConcurrency || 4;
  const memory = (navigator as any).deviceMemory || 4;
  const saveData = (navigator as any).connection?.saveData;
  if (reduced || saveData || cores <= 4 || memory <= 4) return "low";
  return "high";
}

export function playNotificationCue(sound = "pop") {
  if (sound === "none" || typeof window === "undefined") return;

  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const isSoft = sound === "soft";

    osc.type = isSoft ? "sine" : "triangle";
    osc.frequency.value = isSoft ? 540 : 720;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(isSoft ? 0.035 : 0.055, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (isSoft ? 0.22 : 0.14));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isSoft ? 0.24 : 0.16));
    setTimeout(() => ctx.close(), 350);
  } catch {
    // Audio is best effort only.
  }
}
