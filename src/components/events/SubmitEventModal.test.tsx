import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubmitEventModal from './SubmitEventModal';

// Helper to get field by name attribute
function getInput(name: string): HTMLInputElement {
  return document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
}
function getSelect(name: string): HTMLSelectElement {
  return document.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
}
function getTextarea(name: string): HTMLTextAreaElement {
  return document.querySelector(`textarea[name="${name}"]`) as HTMLTextAreaElement;
}

describe('SubmitEventModal', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    render(<SubmitEventModal open={false} onClose={jest.fn()} />);
    expect(screen.queryByText('Submit an Event')).not.toBeInTheDocument();
  });

  it('renders modal content when open is true', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(screen.getByText('Submit an Event')).toBeInTheDocument();
  });

  it('renders performer input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('performer')).toBeInTheDocument();
  });

  it('renders venue_name input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('venue_name')).toBeInTheDocument();
  });

  it('renders city input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('city')).toBeInTheDocument();
  });

  it('renders province select field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getSelect('province')).toBeInTheDocument();
  });

  it('renders event_date input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('event_date')).toBeInTheDocument();
  });

  it('renders event_time input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('event_time')).toBeInTheDocument();
  });

  it('renders price input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('price')).toBeInTheDocument();
  });

  it('renders link input field', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('link')).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getTextarea('description')).toBeInTheDocument();
  });

  it('renders category select with options', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    const categorySelect = getSelect('event_category');
    expect(categorySelect).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Live Music' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Comedy' })).toBeInTheDocument();
  });

  it('renders province select with all provinces', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(screen.getByRole('option', { name: 'Nova Scotia' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'New Brunswick' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Prince Edward Island' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Newfoundland/i })).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<SubmitEventModal open={true} onClose={onClose} />);
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/40') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders submit button', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: /submit event/i })).toBeInTheDocument();
  });

  it('calls fetch POST /api/submissions on submit', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    });

    render(<SubmitEventModal open={true} onClose={jest.fn()} />);

    await user.type(getInput('performer'), 'Jazz Night');
    await user.type(getInput('venue_name'), 'Test Venue');
    await user.type(getInput('city'), 'Halifax');
    await user.selectOptions(getSelect('province'), 'NS');
    await user.type(getInput('event_date'), '2026-06-01');

    await user.click(screen.getByRole('button', { name: /submit event/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/submissions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });
  });

  it('shows success message after successful submission', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    });

    render(<SubmitEventModal open={true} onClose={jest.fn()} />);

    await user.type(getInput('performer'), 'Jazz Night');
    await user.type(getInput('venue_name'), 'Test Venue');
    await user.type(getInput('city'), 'Halifax');
    await user.selectOptions(getSelect('province'), 'NS');
    await user.type(getInput('event_date'), '2026-06-01');

    await user.click(screen.getByRole('button', { name: /submit event/i }));

    await waitFor(() => {
      expect(screen.getByText(/thanks/i)).toBeInTheDocument();
    });
  });

  it('shows error message on failed submission', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid data' }),
    });

    render(<SubmitEventModal open={true} onClose={jest.fn()} />);

    await user.type(getInput('performer'), 'Jazz Night');
    await user.type(getInput('venue_name'), 'Test Venue');
    await user.type(getInput('city'), 'Halifax');
    await user.selectOptions(getSelect('province'), 'NS');
    await user.type(getInput('event_date'), '2026-06-01');

    await user.click(screen.getByRole('button', { name: /submit event/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid data')).toBeInTheDocument();
    });
  });

  it('disables submit button while submitting', async () => {
    const user = userEvent.setup();
    let resolvePromise!: (val: any) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolvePromise = resolve; })
    );

    render(<SubmitEventModal open={true} onClose={jest.fn()} />);

    await user.type(getInput('performer'), 'Jazz Night');
    await user.type(getInput('venue_name'), 'Test Venue');
    await user.type(getInput('city'), 'Halifax');
    await user.selectOptions(getSelect('province'), 'NS');
    await user.type(getInput('event_date'), '2026-06-01');

    await user.click(screen.getByRole('button', { name: /submit event/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });

    // Cleanup — resolve the dangling promise
    resolvePromise({ ok: true, json: async () => ({}) });
  });

  it('honeypot field is aria-hidden', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    const honeypot = getInput('website');
    expect(honeypot).toHaveAttribute('aria-hidden', 'true');
  });

  it('performer field is required', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('performer')).toBeRequired();
  });

  it('venue_name field is required', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('venue_name')).toBeRequired();
  });

  it('city field is required', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('city')).toBeRequired();
  });

  it('event_date field is required', () => {
    render(<SubmitEventModal open={true} onClose={jest.fn()} />);
    expect(getInput('event_date')).toBeRequired();
  });
});
