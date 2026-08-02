import { useMemo } from "react";

export function RewardFireworks({ active }: { active: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 54 }, (_, index) => ({
        id: index,
        x: 8 + ((index * 37) % 84),
        drift: -62 + ((index * 29) % 125),
        delay: (index % 9) * 0.045,
        duration: 1.15 + (index % 7) * 0.11,
        color: ["#f3c969", "#4fd1a5", "#ffffff", "#9ce7cc"][index % 4],
      })),
    [],
  );

  if (!active) return null;

  return (
    <div className="reward-fireworks" aria-hidden="true">
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="reward-firework-particle"
          style={{
            left: `${particle.x}%`,
            color: particle.color,
            backgroundColor: particle.color,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
            "--reward-drift": `${particle.drift}px`,
          } as React.CSSProperties}
        />
      ))}
      <span className="reward-firework-burst reward-firework-burst-left" />
      <span className="reward-firework-burst reward-firework-burst-right" />
    </div>
  );
}
