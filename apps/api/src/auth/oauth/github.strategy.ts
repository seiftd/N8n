import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from '../auth.service';
import { User, AuthProvider } from '../../entities/user.entity';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('GITHUB_OAUTH_CLIENT_ID'),
      clientSecret: configService.get('GITHUB_OAUTH_CLIENT_SECRET'),
      callbackURL: configService.get('GITHUB_OAUTH_CALLBACK_URL', '/api/v1/auth/github/callback'),
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    try {
      this.logger.debug(`GitHub OAuth validation for user: ${profile.id}`);

      const { id, username, displayName, emails, photos } = profile;
      const email = emails[0]?.value;

      if (!email) {
        throw new Error('No email found in GitHub profile');
      }

      // Parse display name
      const nameParts = (displayName || username || '').split(' ');
      const firstName = nameParts[0] || username || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Check if user already exists with GitHub provider
      let user = await this.authService.findUserByProvider(AuthProvider.GITHUB, id);

      if (!user) {
        // Check if user exists with same email but different provider
        user = await this.authService.findUserByEmail(email);
        
        if (user) {
          // Link GitHub account to existing user
          user = await this.authService.linkOAuthAccount(user.id, {
            provider: AuthProvider.GITHUB,
            providerId: id,
            providerData: {
              accessToken,
              refreshToken,
              profile: {
                id,
                username,
                displayName,
                email,
                avatar: photos[0]?.value,
              },
            },
          });
        } else {
          // Create new user
          user = await this.authService.createOAuthUser({
            email,
            firstName,
            lastName,
            avatarUrl: photos[0]?.value,
            provider: AuthProvider.GITHUB,
            providerId: id,
            providerData: {
              accessToken,
              refreshToken,
              profile: {
                id,
                username,
                displayName,
                email,
                avatar: photos[0]?.value,
              },
            },
            emailVerified: true, // GitHub emails are pre-verified
          });
        }
      } else {
        // Update existing OAuth user data
        await this.authService.updateOAuthData(user.id, {
          accessToken,
          refreshToken,
          profile: {
            id,
            username,
            displayName,
            email,
            avatar: photos[0]?.value,
          },
        });
      }

      // Update last login
      await this.authService.updateLastLogin(user.id);

      this.logger.log(`GitHub OAuth successful for user: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error('GitHub OAuth validation failed:', error.message);
      throw error;
    }
  }
}