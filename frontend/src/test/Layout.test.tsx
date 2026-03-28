import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AuthProvider } from '../auth/AuthContext'
import * as authApi from '../api/auth'

function renderLayout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('shows sign in with Google when signed out', async () => {
    vi.spyOn(authApi, 'fetchAuthMe').mockResolvedValue({ authenticated: false })

    renderLayout()

    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
      'href',
      '/api/auth/google',
    )
  })

  it('shows disconnect Google when google integration is connected', async () => {
    const disconnectGoogleIntegration = vi
      .spyOn(authApi, 'disconnectGoogleIntegration')
      .mockResolvedValue()
    vi.spyOn(authApi, 'fetchAuthMe').mockResolvedValue({
      authenticated: true,
      user: {
        id: 'user-2',
        email: 'connected@example.com',
        display_name: 'Connected User',
        picture: null,
      },
      googleIntegration: {
        connected: true,
        provider: 'google',
        hasRefreshToken: true,
        grantedScopes: [],
        photosAppendOnlyGranted: true,
        photosAppReadGranted: false,
        driveFileGranted: false,
        calendarEventsGranted: false,
        documentsGranted: false,
      },
    })

    renderLayout()

    const button = await screen.findByRole('button', { name: 'Disconnect Google' })
    await act(async () => {
      button.click()
    })
    expect(disconnectGoogleIntegration).toHaveBeenCalledTimes(1)
  })
})
