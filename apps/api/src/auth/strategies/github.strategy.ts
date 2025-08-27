import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('GITHUB_CLIENT_ID'),
      clientSecret: configService.get('GITHUB_CLIENT_SECRET'),
      callbackURL: configService.get('GITHUB_CALLBACK_URL', 'http://localhost:3001/api/auth/github/callback'),
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void,
  ): Promise<any> {
    try {
      const { id, username, displayName, emails, photos } = profile;
      
      // GitHub sometimes doesn't provide name, so we'll use username as fallback
      const nameParts = displayName ? displayName.split(' ') : [username, ''];
      const firstName = nameParts[0] || username;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      
      const user = await this.authService.validateOAuthUser({
        provider: 'github',
        providerId: id,
        email: emails?.[0]?.value || `${username}@github.local`, // GitHub might not provide email
        firstName,
        lastName,
        avatar: photos?.[0]?.value,
        accessToken,
        refreshToken,
      });

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
}