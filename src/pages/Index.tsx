import VideoFeed from "@/components/VideoFeed";
import SeoHead from "@/components/SeoHead";

const Index = () => {
  return (
    <>
      <SeoHead
        title="BARDEUR YK — Fil de vidéos courtes"
        description="Découvre un fil personnalisé de vidéos courtes verticales, tendances et créateurs de la communauté BARDEUR YK."
        path="/"
      />
      <h1 className="sr-only">Fil de vidéos courtes BARDEUR YK</h1>
      <VideoFeed />
    </>
  );
};

export default Index;
