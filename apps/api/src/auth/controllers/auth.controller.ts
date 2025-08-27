import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, AuthResponse } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RegisterDto, LoginDto } from '../dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register with email and password
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<{
    success: boolean;
    data: AuthResponse;
    message: string;
  }> {
    try {
      const result = await this.authService.registerWithEmail(
        registerDto.email,
        registerDto.password,
        registerDto.firstName,
        registerDto.lastName
      );

      return {
        success: true,
        data: result,
        message: 'Account created successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Login with email and password
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<{
    success: boolean;
    data: AuthResponse;
    message: string;
  }> {
    try {
      const result = await this.authService.loginWithEmail(
        loginDto.email,
        loginDto.password
      );

      return {
        success: true,
        data: result,
        message: 'Login successful',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Get user profile
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> {
    try {
      const profile = await this.authService.getUserProfile(req.user.id);

      return {
        success: true,
        data: profile,
        message: 'Profile retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Google OAuth - Initiate
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Request() req) {
    // This method initiates the Google OAuth flow
    // The actual authentication is handled by the GoogleStrategy
  }

  /**
   * Google OAuth - Callback
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Request() req, @Res() res: Response) {
    try {
      // User is available in req.user after successful OAuth
      const user = req.user;
      
      // Generate JWT token for the authenticated user
      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
      };
      
      const accessToken = this.authService.generateToken(payload);
      
      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${accessToken}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      }))}`;
      
      res.redirect(redirectUrl);
    } catch (error) {
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
    }
  }

  /**
   * GitHub OAuth - Initiate
   */
  @Get('github')
  @UseGuards(AuthGuard('github'))
  async githubAuth(@Request() req) {
    // This method initiates the GitHub OAuth flow
  }

  /**
   * GitHub OAuth - Callback
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubAuthCallback(@Request() req, @Res() res: Response) {
    try {
      const user = req.user;
      
      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
      };
      
      const accessToken = this.authService.generateToken(payload);
      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${accessToken}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      }))}`;
      
      res.redirect(redirectUrl);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
    }
  }

  /**
   * Logout
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // In a more sophisticated implementation, you might:
      // 1. Add the token to a blacklist
      // 2. Clear any refresh tokens
      // 3. Log the logout event
      
      return {
        success: true,
        message: 'Logout successful',
      };
    } catch (error) {
      throw new BadRequestException('Logout failed');
    }
  }

  /**
   * Refresh token (placeholder for future implementation)
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body('refreshToken') refreshToken: string): Promise<{
    success: boolean;
    data?: { accessToken: string };
    message: string;
  }> {
    // Placeholder for refresh token implementation
    // In a production app, you would:
    // 1. Validate the refresh token
    // 2. Generate a new access token
    // 3. Optionally rotate the refresh token
    
    return {
      success: false,
      message: 'Refresh token functionality not yet implemented',
    };
  }

  /**
   * Check authentication status
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getAuthStatus(@Request() req): Promise<{
    success: boolean;
    data: {
      authenticated: boolean;
      user: any;
    };
    message: string;
  }> {
    return {
      success: true,
      data: {
        authenticated: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          role: req.user.role,
        },
      },
      message: 'Authentication status retrieved',
    };
  }
}