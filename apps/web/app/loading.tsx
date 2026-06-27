export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'oklch(0.97 0.01 280)' }}
    >
      <div
        className="animate-spin"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid oklch(0.9 0.04 280)',
          borderTopColor: 'oklch(0.52 0.22 305)',
        }}
      />
    </div>
  );
}
