import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

test('renders PIN screen initially and unlocks with valid PIN', async () => {
  render(<App />);
  const pinTitle = screen.getByText(/Enter PIN/i);
  expect(pinTitle).toBeInTheDocument();

  const unlockButton = screen.getByRole('button', { name: /unlock/i });
  expect(unlockButton).toBeInTheDocument();

  const pinInput = screen.getByPlaceholderText('••••');
  expect(pinInput).toBeInTheDocument();

  jest.spyOn(global, 'fetch').mockImplementation((url) => {
    if (url.endsWith('/api/login')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'mock-token-xyz' }),
      });
    }
    if (url.endsWith('/api/accounts')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
    }
    return Promise.reject(new Error('not found'));
  });

  fireEvent.change(pinInput, { target: { value: '1234' } });
  fireEvent.click(unlockButton);

  await waitFor(() => {
    expect(screen.getByText(/Record payment/i)).toBeInTheDocument();
  });

  global.fetch.mockRestore();
});
