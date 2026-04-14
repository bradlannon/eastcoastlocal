import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock nuqs before importing the component
const mockSetCategory = jest.fn();
let mockCategory: string | null = null;

jest.mock('nuqs', () => ({
  useQueryState: jest.fn((_key: string) => [mockCategory, mockSetCategory]),
}));

import CategoryChipsRow from './CategoryChipsRow';
import { PUBLIC_CATEGORIES } from '@/lib/categories';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

beforeEach(() => {
  jest.clearAllMocks();
  mockCategory = null;
});

describe('CategoryChipsRow', () => {
  it('renders event count badge', () => {
    render(<CategoryChipsRow eventCount={7} />);
    expect(screen.getByText('7 events')).toBeInTheDocument();
  });

  it('renders singular "event" for count of 1', () => {
    render(<CategoryChipsRow eventCount={1} />);
    expect(screen.getByText('1 event')).toBeInTheDocument();
  });

  it('renders "All" chip', () => {
    render(<CategoryChipsRow eventCount={0} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('renders a chip for each public category', () => {
    render(<CategoryChipsRow eventCount={0} />);
    for (const cat of PUBLIC_CATEGORIES) {
      const label = CATEGORY_META[cat as EventCategory].label;
      const buttons = screen.getAllByRole('button', { name: label });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('"All" chip is active (has active class) when no category selected', () => {
    mockCategory = null;
    render(<CategoryChipsRow eventCount={3} />);
    const allBtn = screen.getByRole('button', { name: 'All' });
    expect(allBtn).toHaveClass('bg-[#2A9D8F]');
  });

  it('category chip is active when that category is selected', () => {
    mockCategory = 'live_music';
    render(<CategoryChipsRow eventCount={3} />);
    const liveMusicBtn = screen.getByRole('button', { name: 'Live Music' });
    expect(liveMusicBtn).toHaveClass('bg-[#2A9D8F]');
  });

  it('"All" chip is not active when a category is selected', () => {
    mockCategory = 'comedy';
    render(<CategoryChipsRow eventCount={3} />);
    const allBtn = screen.getByRole('button', { name: 'All' });
    expect(allBtn).not.toHaveClass('bg-[#2A9D8F]');
  });

  it('clicking "All" calls setCategory with null', async () => {
    const user = userEvent.setup();
    mockCategory = 'comedy';
    render(<CategoryChipsRow eventCount={3} />);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(mockSetCategory).toHaveBeenCalledWith(null);
  });

  it('clicking a category chip calls setCategory with that category', async () => {
    const user = userEvent.setup();
    render(<CategoryChipsRow eventCount={3} />);
    await user.click(screen.getByRole('button', { name: 'Comedy' }));
    expect(mockSetCategory).toHaveBeenCalledWith('comedy');
  });

  it('clicking a second category chip calls setCategory with the new category', async () => {
    const user = userEvent.setup();
    mockCategory = 'live_music';
    render(<CategoryChipsRow eventCount={3} />);
    await user.click(screen.getByRole('button', { name: 'Theatre' }));
    expect(mockSetCategory).toHaveBeenCalledWith('theatre');
  });
});
