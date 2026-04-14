import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSetWhen = jest.fn();
const mockSetCategory = jest.fn();
let mockWhen: string | null = null;
let mockCategory: string | null = null;

jest.mock('nuqs', () => ({
  useQueryState: jest.fn((key: string) => {
    if (key === 'when') return [mockWhen, mockSetWhen];
    if (key === 'category') return [mockCategory, mockSetCategory];
    return [null, jest.fn()];
  }),
}));

import EventFilters from './EventFilters';

beforeEach(() => {
  jest.clearAllMocks();
  mockWhen = null;
  mockCategory = null;
});

describe('EventFilters', () => {
  const defaultProps = {
    eventCount: 10,
    search: null,
    onSearchChange: jest.fn(),
    onSubmitEvent: jest.fn(),
  };

  it('renders date filter chips', () => {
    render(<EventFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This Weekend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next 30 Days' })).toBeInTheDocument();
  });

  it('renders category filter chips including "All Types"', () => {
    render(<EventFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'All Types' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Live Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comedy' })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<EventFilters {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders Submit Event button', () => {
    render(<EventFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: /\+ Submit Event/i })).toBeInTheDocument();
  });

  it('clicking "Today" chip calls setWhen with "today"', async () => {
    const user = userEvent.setup();
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(mockSetWhen).toHaveBeenCalledWith('today');
  });

  it('clicking "This Weekend" chip calls setWhen with "weekend"', async () => {
    const user = userEvent.setup();
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'This Weekend' }));
    expect(mockSetWhen).toHaveBeenCalledWith('weekend');
  });

  it('clicking "This Week" chip calls setWhen with "week"', async () => {
    const user = userEvent.setup();
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'This Week' }));
    expect(mockSetWhen).toHaveBeenCalledWith('week');
  });

  it('clicking "Next 30 Days" chip calls setWhen with "month"', async () => {
    const user = userEvent.setup();
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'Next 30 Days' }));
    expect(mockSetWhen).toHaveBeenCalledWith('month');
  });

  it('clicking "All" date chip calls setWhen with null', async () => {
    const user = userEvent.setup();
    mockWhen = 'today';
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(mockSetWhen).toHaveBeenCalledWith(null);
  });

  it('clicking a category chip calls setCategory', async () => {
    const user = userEvent.setup();
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'Live Music' }));
    expect(mockSetCategory).toHaveBeenCalledWith('live_music');
  });

  it('clicking "All Types" calls setCategory with null', async () => {
    const user = userEvent.setup();
    mockCategory = 'comedy';
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'All Types' }));
    expect(mockSetCategory).toHaveBeenCalledWith(null);
  });

  it('does not show Clear button when no filters active', () => {
    mockWhen = null;
    mockCategory = null;
    render(<EventFilters {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('shows Clear button when a when filter is active', () => {
    mockWhen = 'today';
    render(<EventFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('shows Clear button when a category filter is active', () => {
    mockCategory = 'comedy';
    render(<EventFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('clicking Clear resets both when and category to null', async () => {
    const user = userEvent.setup();
    mockWhen = 'today';
    mockCategory = 'comedy';
    render(<EventFilters {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(mockSetWhen).toHaveBeenCalledWith(null);
    expect(mockSetCategory).toHaveBeenCalledWith(null);
  });

  it('search input reflects current search value', () => {
    render(<EventFilters {...defaultProps} search="jazz" />);
    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
    expect(input.value).toBe('jazz');
  });

  it('typing in search calls onSearchChange', async () => {
    const user = userEvent.setup();
    const onSearchChange = jest.fn();
    render(<EventFilters {...defaultProps} onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText('Search...');
    await user.type(input, 'rock');
    expect(onSearchChange).toHaveBeenCalled();
  });

  it('clicking Submit Event button calls onSubmitEvent', async () => {
    const user = userEvent.setup();
    const onSubmitEvent = jest.fn();
    render(<EventFilters {...defaultProps} onSubmitEvent={onSubmitEvent} />);
    await user.click(screen.getByRole('button', { name: /\+ Submit Event/i }));
    expect(onSubmitEvent).toHaveBeenCalledTimes(1);
  });

  it('"Today" chip has active style when when === "today"', () => {
    mockWhen = 'today';
    render(<EventFilters {...defaultProps} />);
    const todayBtn = screen.getByRole('button', { name: 'Today' });
    expect(todayBtn).toHaveClass('bg-[#2A9D8F]');
  });
});
