/** The lit stage behind every screen: drifting light and a 3D grid floor. Pure CSS. */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-orb ambient-orb--lime" />
      <div className="ambient-orb ambient-orb--sky" />
      <div className="ambient-orb ambient-orb--team" />
      <div className="ambient-floor" />
    </div>
  );
}
