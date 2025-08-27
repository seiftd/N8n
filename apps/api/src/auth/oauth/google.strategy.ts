import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';
import { User, AuthProvider } from '../../entities/user.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('GOOGLE_OAUTH_CLIENT_ID'),
      clientSecret: configService.get('GOOGLE_OAUTH_CLIENT_SECRET'),
      callbackURL: configService.get('GOOGLE_OAUTH_CALLBACK_URL', '/api/v1/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      this.logger.debug(`Google OAuth validation for user: ${profile.id}`);

      const { id, name, emails, photos } = profile;
      const email = emails[0]?.value;

      if (!email) {
        throw new Error('No email found in Google profile');
      }

      // Check if user already exists with Google provider
      let user = await this.authService.findUserByProvider(AuthProvider.GOOGLE, id);

      if (!user) {
        // Check if user exists with same email but different provider
        user = await this.authService.findUserByEmail(email);
        
        if (user) {
          // Link Google account to existing user
          user = await this.authService.linkOAuthAccount(user.id, {
            provider: AuthProvider.GOOGLE,
            providerId: id,
            providerData: {
              accessToken,
              refreshToken,
              profile: {
                id,
                name,
                email,
                picture: photos[0]?.value,
              },
            },
          });
        } else {
          // Create new user
          user = await this.authService.createOAuthUser({
            email,
            firstName: name.givenName || '',
            lastName: name.familyName || '',
            avatarUrl: photos[0]?.value,
            provider: AuthProvider.GOOGLE,
            providerId: id,
            providerData: {
              accessToken,
              refreshToken,
              profile: {
                id,
                name,
                email,
                picture: photos[0]?.value,
              },
            },
            emailVerified: true, // Google emails are pre-verified
          });
        }
      } else {
        // Update existing OAuth user data
        await this.authService.updateOAuthData(user.id, {
          accessToken,
          refreshToken,
          profile: {
            id,
            name,
            email,
            picture: photos[0]?.value,
          },
        });
      }

      // Update last login
      await this.authService.updateLastLogin(user.id);

      this.logger.log(`Google OAuth successful for user: ${user.email}`);
      done(null, user);
    } catch (error) {
      this.logger.error('Google OAuth validation failed:', error.message);
      done(error, null);
    }
  }
}