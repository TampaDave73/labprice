export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'oklch(0.97 0.01 280)' }}
    >
      <div
        className="w-10 h-10 rounded-full border-[3px] border-[oklch(0.9_0.04_280)] animate-spin"
        style={{ borderTopColor: 'oklch(0.52 0.18 232)' }}
      />
    </div>
  );
}
