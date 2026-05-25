export type NotificationType = "all" | "like" | "comment" | "follow" | "message" | "share" | "mention" | "video";

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

export function allowsNotificationType(profile: NotificationProfile | null | undefined, type: NotificationType) {
  if (!profile?.push_notifications) return false;
  if (type === "all" || type === "video") return true;
  const key = typeToProfileKey[type];
  return key ? profile[key] !== false : true;
}

export function getNotificationSound(profile?: NotificationProfile | null) {
  return profile?.notification_sound || "pop";
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
