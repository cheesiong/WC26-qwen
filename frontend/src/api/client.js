import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

export const getTeams = () => api.get('/teams').then(r => r.data);
export const getTeam = (id) => api.get(`/teams/${id}`).then(r => r.data);

export const getMatches = (params = {}) => api.get('/matches', { params }).then(r => r.data);
export const getTodayMatches = () => api.get('/matches/today').then(r => r.data);
export const getUpcomingMatches = () => api.get('/matches/upcoming').then(r => r.data);
export const getUpsetWatch = () => api.get('/matches/upset-watch').then(r => r.data);
export const getMatch = (id) => api.get(`/matches/${id}`).then(r => r.data);
export const submitResult = (id, data) => api.post(`/matches/${id}/result`, data).then(r => r.data);

export const getPrediction = (matchId, refresh = false, lang = 'en') => {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', 'true');
  if (lang === 'zh') params.set('lang', 'zh');
  const qs = params.toString();
  return api.get(`/matches/${matchId}/prediction${qs ? `?${qs}` : ''}`).then(r => r.data);
};

export const getPredictionHistory = (matchId) =>
  api.get(`/matches/${matchId}/predictions`).then(r => r.data);

export const generateAllPredictions = () =>
  api.post('/predictions/generate-all', {}, { timeout: 600000 }).then(r => r.data);

export const getGroups = () => api.get('/groups').then(r => r.data);
export const getGroup = (g) => api.get(`/groups/${g}`).then(r => r.data);
export const getGroupScenarios = (g) => api.get(`/groups/${g}/scenarios`).then(r => r.data);

export const getTournamentBracket = () => api.get('/tournament/bracket').then(r => r.data);
export const getWinnerProbabilities = () => api.get('/tournament/winner-probabilities').then(r => r.data);
export const getRoadToFinal = () => api.get('/tournament/road-to-final').then(r => r.data);

export const getAccuracy = () => api.get('/analytics/accuracy').then(r => r.data);
export const syncResults = () => api.post('/sync').then(r => r.data);
export const simulateKnockoutBracket = () =>
  api.post('/tournament/simulate-knockout', {}, { timeout: 600000 }).then(r => r.data);

export const getMatchSuspensions = (matchId) => api.get(`/matches/${matchId}/suspensions`).then(r => r.data);
export const getLineup = (matchId) => api.get(`/matches/${matchId}/lineup`).then(r => r.data);
export const getH2H = (teamA, teamB) => api.get(`/h2h/${teamA}/${teamB}`).then(r => r.data);
export const getAgentSession = (matchId) => api.get(`/matches/${matchId}/agent-session`).then(r => r.data);
