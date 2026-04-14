import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MobileTabBar from './MobileTabBar';

describe('MobileTabBar', () => {
  it('renders Map and List buttons', () => {
    render(<MobileTabBar activeTab="map" onTabChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /map view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
  });

  it('shows map text and list text', () => {
    render(<MobileTabBar activeTab="map" onTabChange={jest.fn()} />);
    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('List')).toBeInTheDocument();
  });

  it('calls onTabChange with "list" when list button clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(<MobileTabBar activeTab="map" onTabChange={onTabChange} />);
    await user.click(screen.getByRole('button', { name: /list view/i }));
    expect(onTabChange).toHaveBeenCalledWith('list');
  });

  it('calls onTabChange with "map" when map button clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(<MobileTabBar activeTab="list" onTabChange={onTabChange} />);
    await user.click(screen.getByRole('button', { name: /map view/i }));
    expect(onTabChange).toHaveBeenCalledWith('map');
  });

  it('applies active style to map tab when activeTab is map', () => {
    render(<MobileTabBar activeTab="map" onTabChange={jest.fn()} />);
    const mapBtn = screen.getByRole('button', { name: /map view/i });
    expect(mapBtn).toHaveClass('text-orange-600');
    const listBtn = screen.getByRole('button', { name: /list view/i });
    expect(listBtn).toHaveClass('text-gray-500');
  });

  it('applies active style to list tab when activeTab is list', () => {
    render(<MobileTabBar activeTab="list" onTabChange={jest.fn()} />);
    const listBtn = screen.getByRole('button', { name: /list view/i });
    expect(listBtn).toHaveClass('text-orange-600');
    const mapBtn = screen.getByRole('button', { name: /map view/i });
    expect(mapBtn).toHaveClass('text-gray-500');
  });
});
