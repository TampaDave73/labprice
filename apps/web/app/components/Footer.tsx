export default function Footer() {
  return (
    <footer className="bg-brand-900 px-6 py-10 mt-auto" style={{ background: 'oklch(0.17 0.09 280)' }}>
      <div className="max-w-[1240px] mx-auto flex items-center justify-between flex-wrap gap-5">
        <div>
          <div className="text-base font-bold text-white mb-1.5">LabPrice</div>
          <p className="text-[13px] text-[oklch(0.65_0.05_280)] leading-relaxed">
            Compare blood test ordering prices. Blood drawn at Quest or LabCorp patient service centers.
          </p>
        </div>
        <p className="text-xs text-[oklch(0.5_0.04_280)] text-right leading-relaxed">
          Prices for informational purposes only.
          <br />
          &copy; 2025 LabPrice. Not medical advice.
        </p>
      </div>
    </footer>
  );
}
