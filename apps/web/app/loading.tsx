export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'oklch(0.985 0.005 260)' }}
    >
      <div
        className="animate-spin"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid oklch(0.9 0.04 260)',
          borderTopColor: 'oklch(0.49 0.14 262)',
        }}
      />
    </div>
  );
}
