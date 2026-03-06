import NavBar from '../components/NavBar';

export default function PromptEditor() {
  return (
    <>
      <NavBar />
      <main style={{
        padding: '3rem 1.5rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <h1 style={{
          fontFamily: "'Libre Baskerville', serif",
          fontSize: '2rem',
          color: '#f5f0e8',
          margin: '0 0 1rem',
        }}>
          Prompt Editor
        </h1>
        <p style={{
          color: 'rgba(245,240,232,0.5)',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Coming Soon
        </p>
      </main>
    </>
  );
}
