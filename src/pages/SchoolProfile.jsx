import { useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';

export default function SchoolProfile() {
  const { schoolId } = useParams();

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
          School Profile: {schoolId}
        </h1>
      </main>
    </>
  );
}
