/**
 * Component tests for DeleteVenueButton.
 *
 * Tests:
 * - renders disabled with tooltip when blocked (eventCount or sourceCount > 0)
 * - renders enabled when counts are 0
 * - click → calls deleteVenue action; on success navigates to /admin/venues
 * - click → on failure, shows error text
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock next/navigation ─────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ─── Mock the server action ───────────────────────────────────────────────

const mockDeleteVenue = jest.fn();

jest.mock('@/app/admin/venues/actions', () => ({
  deleteVenue: (...args: unknown[]) => mockDeleteVenue(...args),
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────

import DeleteVenueButton from './DeleteVenueButton';

// ─── Helpers ──────────────────────────────────────────────────────────────

function setup(eventCount = 0, sourceCount = 0) {
  return render(
    <DeleteVenueButton venueId={42} eventCount={eventCount} sourceCount={sourceCount} />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('DeleteVenueButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: confirm returns true
    window.confirm = jest.fn(() => true);
  });

  it('renders the delete button', () => {
    setup(0, 0);
    expect(screen.getByRole('button', { name: /delete venue/i })).toBeInTheDocument();
  });

  it('is enabled when eventCount and sourceCount are both 0', () => {
    setup(0, 0);
    expect(screen.getByRole('button', { name: /delete venue/i })).not.toBeDisabled();
  });

  it('is disabled when eventCount > 0', () => {
    setup(3, 0);
    expect(screen.getByRole('button', { name: /delete venue/i })).toBeDisabled();
  });

  it('is disabled when sourceCount > 0', () => {
    setup(0, 2);
    expect(screen.getByRole('button', { name: /delete venue/i })).toBeDisabled();
  });

  it('shows tooltip with event count when blocked by events', () => {
    setup(3, 0);
    // tooltip text appears in the DOM (title attribute or aria-label or visible text)
    const button = screen.getByRole('button', { name: /delete venue/i });
    const title = button.getAttribute('title') ?? '';
    expect(title).toMatch(/3/);
    expect(title).toMatch(/event/i);
  });

  it('shows tooltip with source count when blocked by sources', () => {
    setup(0, 2);
    const button = screen.getByRole('button', { name: /delete venue/i });
    const title = button.getAttribute('title') ?? '';
    expect(title).toMatch(/2/);
    expect(title).toMatch(/source/i);
  });

  it('shows tooltip with both counts when blocked by events and sources', () => {
    setup(5, 3);
    const button = screen.getByRole('button', { name: /delete venue/i });
    const title = button.getAttribute('title') ?? '';
    expect(title).toMatch(/5/);
    expect(title).toMatch(/3/);
  });

  it('calls deleteVenue and redirects on success', async () => {
    const user = userEvent.setup();
    mockDeleteVenue.mockResolvedValue({ success: true });

    setup(0, 0);

    await user.click(screen.getByRole('button', { name: /delete venue/i }));

    await waitFor(() => {
      expect(mockDeleteVenue).toHaveBeenCalledWith('42');
    });
    expect(mockPush).toHaveBeenCalledWith('/admin/venues');
  });

  it('does not call deleteVenue when confirm is cancelled', async () => {
    const user = userEvent.setup();
    window.confirm = jest.fn(() => false);

    setup(0, 0);

    await user.click(screen.getByRole('button', { name: /delete venue/i }));

    expect(mockDeleteVenue).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows error message when deleteVenue returns failure', async () => {
    const user = userEvent.setup();
    mockDeleteVenue.mockResolvedValue({ success: false, error: 'Venue has 2 events — detach or archive them first.' });

    setup(0, 0);

    await user.click(screen.getByRole('button', { name: /delete venue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Venue has 2 events/i)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
