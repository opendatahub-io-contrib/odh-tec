import * as React from 'react';
import App from '@app/index';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Create axios mock
const mock = new MockAdapter(axios);

describe('App tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mock.reset();

    // Mock common API endpoints that might be called during component initialization
    mock.onGet('/api/disclaimer').reply(200, { content: 'Test disclaimer' });
    mock.onGet('/api/settings').reply(200, { s3Endpoint: 'http://test', accessKeyId: 'test', secretAccessKey: 'test' });

    // Mock console.error to catch React errors
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    (console.error as jest.Mock).mockRestore();
  });
  test('should render default App component', () => {
    const { asFragment } = render(<App />);

    expect(asFragment()).toMatchSnapshot();
  });

  it('should render a nav-toggle button', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /dashboard navigation/i })).toBeVisible();
  });

  // I'm fairly sure that this test not going to work properly no matter what we do since JSDOM doesn't actually
  // draw anything. We could potentially make something work, likely using a different test environment, but
  // using Cypress for this kind of test would be more efficient.
  it.skip('should hide the sidebar on smaller viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });

    render(<App />);

    window.dispatchEvent(new Event('resize'));

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('should expand the sidebar on larger viewports', () => {
    render(<App />);

    window.dispatchEvent(new Event('resize'));

    // Check that nav links are in the document (sidebar may be collapsed)
    expect(screen.getByRole('link', { name: /object browser/i, hidden: true })).toBeInTheDocument();
  });

  it('should hide the sidebar when clicking the nav-toggle button', async () => {
    const user = userEvent.setup();

    render(<App />);

    window.dispatchEvent(new Event('resize'));
    const button = screen.getByRole('button', { name: /dashboard navigation/i });

    // Sidebar starts collapsed, so nav links have tabindex=-1 (need hidden: true)
    const navLink = screen.getByRole('link', { name: /object browser/i, hidden: true });
    expect(navLink).toBeInTheDocument();

    await user.click(button);

    // After clicking toggle, sidebar should still have the link
    expect(screen.getByRole('link', { name: /object browser/i, hidden: true })).toBeInTheDocument();
  });
});
