import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as authApi from '../api/auth'
import { AuthProvider } from '../auth/AuthContext'
import { SettingsPage } from '../pages/SettingsPage'

describe('SettingsPage', () => {
  it('shows google integration details and disconnect action', async () => {
    const disconnectGoogleIntegration = vi
      .spyOn(authApi, 'disconnectGoogleIntegration')
      .mockResolvedValue()
    vi.spyOn(authApi, 'fetchAuthMe').mockResolvedValue({
      authenticated: true,
      user: {
        id: 'user-7',
        email: 'user7@example.com',
        display_name: 'User Seven',
        picture: null,
      },
      googleIntegration: {
        connected: true,
        provider: 'google',
        hasRefreshToken: true,
        grantedScopes: [
          'https://www.googleapis.com/auth/photoslibrary.appendonly',
        ],
        photosAppendOnlyGranted: true,
        photosAppReadGranted: false,
        driveFileGranted: false,
        calendarEventsGranted: false,
        documentsGranted: false,
      },
    })
    vi.spyOn(authApi, 'fetchAuthStatus').mockResolvedValue({
      status: 'ready',
      googleOAuthConfigured: true,
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

    render(
      <MemoryRouter>
        <AuthProvider>
          <SettingsPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('User Seven')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Present')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Photos append-only')).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Disconnect Google' }).click()
    })
    expect(disconnectGoogleIntegration).toHaveBeenCalledTimes(1)
  })
})
