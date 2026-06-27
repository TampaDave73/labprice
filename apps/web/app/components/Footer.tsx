export default function Footer() {
  return (
    <footer style={{ background: 'oklch(0.17 0.09 280)', padding: '40px 24px', marginTop: 'auto' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>LabPrice</div>
          <p style={{ fontSize: 13, color: 'oklch(0.65 0.05 280)', lineHeight: 1.55, margin: 0 }}>
            Compare blood test ordering prices. Blood drawn at Quest or LabCorp patient service centers.
          </p>
        </div>
        <p style={{ fontSize: 12, color: 'oklch(0.5 0.04 280)', textAlign: 'right', lineHeight: 1.55, margin: 0 }}>
          Prices for informational purposes only.
          <br />
          &copy; 2025 LabPrice. Not medical advice.
        </p>

      </div>
    </footer>
  );
}
