/**
 * Task 3.13c — ModeToggle characterization tests
 */

import { render, screen, fireEvent } from '@testing-library/react';
import ModeToggle from './ModeToggle';

describe('ModeToggle', () => {
  it('renders a button', () => {
    render(<ModeToggle mapMode="cluster" onToggle={jest.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('aria-label says "Switch to heatmap view" in cluster mode', () => {
    render(<ModeToggle mapMode="cluster" onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: /switch to heatmap view/i })).toBeInTheDocument();
  });

  it('aria-label says "Switch to pin view" in timelapse mode', () => {
    render(<ModeToggle mapMode="timelapse" onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: /switch to pin view/i })).toBeInTheDocument();
  });

  it('calls onToggle when button is clicked', () => {
    const onToggle = jest.fn();
    render(<ModeToggle mapMode="cluster" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle in timelapse mode too', () => {
    const onToggle = jest.fn();
    render(<ModeToggle mapMode="timelapse" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
