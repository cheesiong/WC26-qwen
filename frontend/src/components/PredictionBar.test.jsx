import { render, screen } from '@testing-library/react';
import PredictionBar from './PredictionBar';

describe('PredictionBar', () => {
  const defaultProps = {
    probHome: 0.55,
    probDraw: 0.25,
    probAway: 0.20,
    homeName: 'Brazil',
    awayName: 'Argentina',
  };

  it('renders team names', () => {
    render(<PredictionBar {...defaultProps} />);
    expect(screen.getByText('Brazil')).toBeInTheDocument();
    expect(screen.getByText('Argentina')).toBeInTheDocument();
    expect(screen.getByText('Draw')).toBeInTheDocument();
  });

  it('displays correct percentages', () => {
    render(<PredictionBar {...defaultProps} />);
    expect(screen.getAllByText('55%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('20%').length).toBeGreaterThan(0);
  });

  it('shows large size variant without errors', () => {
    render(<PredictionBar {...defaultProps} size="lg" />);
    expect(screen.getByText('Brazil')).toBeInTheDocument();
  });
});
