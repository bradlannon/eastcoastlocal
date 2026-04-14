import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomePopup from './WelcomePopup';

const STORAGE_KEY = 'ecl-welcome-seen';

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('WelcomePopup', () => {
  it('shows on first visit (localStorage empty)', () => {
    render(<WelcomePopup />);
    expect(screen.getByText('Welcome to East Coast Local')).toBeInTheDocument();
  });

  it('does not show when localStorage has seen key', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    render(<WelcomePopup />);
    expect(screen.queryByText('Welcome to East Coast Local')).not.toBeInTheDocument();
  });

  it('renders "Get Started" button', () => {
    render(<WelcomePopup />);
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('dismisses when "Get Started" is clicked and persists to localStorage', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WelcomePopup />);
    await user.click(screen.getByRole('button', { name: /get started/i }));
    expect(screen.queryByText('Welcome to East Coast Local')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('dismisses when backdrop is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WelcomePopup />);
    // Backdrop is the sibling absolute div
    const backdrop = document.querySelector('.absolute.inset-0') as HTMLElement;
    await user.click(backdrop);
    expect(screen.queryByText('Welcome to East Coast Local')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('shows countdown timer', () => {
    render(<WelcomePopup />);
    // Initial countdown is 20
    expect(screen.getByText(/20s/)).toBeInTheDocument();
  });

  it('auto-closes after countdown reaches 0', async () => {
    render(<WelcomePopup />);
    expect(screen.getByText('Welcome to East Coast Local')).toBeInTheDocument();
    // Tick through each second (21 ticks to ensure countdown passes 0)
    for (let i = 0; i <= 21; i++) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(screen.queryByText('Welcome to East Coast Local')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('contains feature highlights', () => {
    render(<WelcomePopup />);
    expect(screen.getByText('Explore the Map')).toBeInTheDocument();
    expect(screen.getByText('Filter & Search')).toBeInTheDocument();
    expect(screen.getByText('Submit an Event')).toBeInTheDocument();
  });
});
