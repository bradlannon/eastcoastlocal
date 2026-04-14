import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimelineBar from './TimelineBar';

const defaultProps = {
  timePosition: 0,
  isPlaying: false,
  currentLabel: 'Mon, Apr 14',
  eventCount: 5,
  showHeatmap: false,
  onPositionChange: jest.fn(),
  onScrubStart: jest.fn(),
  onPlayPause: jest.fn(),
  onToggleHeatmap: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TimelineBar', () => {
  it('renders the play button when not playing', () => {
    render(<TimelineBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('renders the pause button when playing', () => {
    render(<TimelineBar {...defaultProps} isPlaying={true} />);
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('calls onPlayPause when play button clicked', async () => {
    const user = userEvent.setup();
    render(<TimelineBar {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /play/i }));
    expect(defaultProps.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('calls onPlayPause when pause button clicked', async () => {
    const user = userEvent.setup();
    render(<TimelineBar {...defaultProps} isPlaying={true} />);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(defaultProps.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('renders the timeline scrubber', () => {
    render(<TimelineBar {...defaultProps} />);
    expect(screen.getByRole('slider', { name: /timeline scrubber/i })).toBeInTheDocument();
  });

  it('scrubber has correct value matching timePosition', () => {
    render(<TimelineBar {...defaultProps} timePosition={0.5} />);
    const slider = screen.getByRole('slider', { name: /timeline scrubber/i }) as HTMLInputElement;
    expect(parseFloat(slider.value)).toBeCloseTo(0.5);
  });

  it('calls onPositionChange when scrubber changes', () => {
    render(<TimelineBar {...defaultProps} />);
    const slider = screen.getByRole('slider', { name: /timeline scrubber/i });
    fireEvent.change(slider, { target: { value: '0.5', valueAsNumber: 0.5 } });
    expect(defaultProps.onPositionChange).toHaveBeenCalledWith(0.5);
  });

  it('calls onScrubStart on mousedown of scrubber', () => {
    render(<TimelineBar {...defaultProps} />);
    const slider = screen.getByRole('slider', { name: /timeline scrubber/i });
    fireEvent.mouseDown(slider);
    expect(defaultProps.onScrubStart).toHaveBeenCalledTimes(1);
  });

  it('calls onScrubStart on touchstart of scrubber', () => {
    render(<TimelineBar {...defaultProps} />);
    const slider = screen.getByRole('slider', { name: /timeline scrubber/i });
    fireEvent.touchStart(slider);
    expect(defaultProps.onScrubStart).toHaveBeenCalledTimes(1);
  });

  it('displays the current label', () => {
    render(<TimelineBar {...defaultProps} currentLabel="Sat, May 1" />);
    expect(screen.getByText('Sat, May 1')).toBeInTheDocument();
  });

  it('displays the event count', () => {
    render(<TimelineBar {...defaultProps} eventCount={42} />);
    expect(screen.getByRole('status')).toHaveTextContent('42');
  });

  it('renders heatmap toggle button with "Show heatmap" label when hidden', () => {
    render(<TimelineBar {...defaultProps} showHeatmap={false} />);
    expect(screen.getByRole('button', { name: /show heatmap/i })).toBeInTheDocument();
  });

  it('renders heatmap toggle button with "Hide heatmap" label when visible', () => {
    render(<TimelineBar {...defaultProps} showHeatmap={true} />);
    expect(screen.getByRole('button', { name: /hide heatmap/i })).toBeInTheDocument();
  });

  it('calls onToggleHeatmap when heatmap button clicked', async () => {
    const user = userEvent.setup();
    render(<TimelineBar {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /show heatmap/i }));
    expect(defaultProps.onToggleHeatmap).toHaveBeenCalledTimes(1);
  });

  it('scrubber min is 0 and max is 1', () => {
    render(<TimelineBar {...defaultProps} />);
    const slider = screen.getByRole('slider', { name: /timeline scrubber/i }) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1');
  });
});
