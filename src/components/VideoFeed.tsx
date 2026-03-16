import { useState, useRef, useEffect, useCallback } from "react";
import VideoCard from "./VideoCard";
import { mockVideos } from "@/data/mockVideos";

export default function VideoFeed() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIndex(idx);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className="h-[100svh] w-full snap-y-mandatory overflow-y-scroll no-scrollbar"
    >
      {mockVideos.map((video, i) => (
        <VideoCard
          key={video.id}
          video={video}
          isActive={i === activeIndex}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted((p) => !p)}
        />
      ))}
    </div>
  );
}
