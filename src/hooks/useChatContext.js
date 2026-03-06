import { useLocation, useParams } from 'react-router-dom';

export function useChatContext() {
  const location = useLocation();
  const params = useParams();

  // Detect /school/:schoolId route
  const schoolMatch = location.pathname.match(/^\/school\/([^/]+)/);
  const currentSchoolId = schoolMatch ? schoolMatch[1] : null;

  let currentPage = 'home';
  if (currentSchoolId) currentPage = 'school';
  else if (location.pathname.startsWith('/archive')) currentPage = 'archive';
  else if (location.pathname.startsWith('/metrics')) currentPage = 'metrics';
  else if (location.pathname.startsWith('/admin')) currentPage = 'admin';

  return { currentSchoolId, currentPage };
}
