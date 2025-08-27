import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole, AuthProvider } from '../entities/user.entity';
import { RegisterDto, LoginDto } from './dto';
import { JwtPayload } from './jwt.strategy';

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  accessToken: string;
}

export interface OAuthUserData {
  provider: string;
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  accessToken?: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const { email, password, firstName, lastName, avatarUrl } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = this.userRepository.create({
      firstName,
      lastName,
      email,
      passwordHash,
      avatarUrl,
      role: UserRole.USER,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(user);

    // Generate JWT token
    const payload: JwtPayload = {
      sub: savedUser.id,
      email: savedUser.email,
    };

    const accessToken = this.jwtService.sign(payload);

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = savedUser;

    return {
      user: userWithoutPassword,
      accessToken,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login time
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // Generate JWT token
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }

  async getUserProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Validate OAuth user and create/update account
   */
  async validateOAuthUser(userData: OAuthUserData): Promise<User> {
    try {
      // Check if user already exists with this OAuth provider
      let user = await this.userRepository.findOne({
        where: {
          provider: userData.provider as AuthProvider,
          providerId: userData.providerId,
        },
      });

      if (user) {
        // Update existing OAuth user
        user.lastActivityAt = new Date();
        user.providerData = {
          accessToken: userData.accessToken,
          refreshToken: userData.refreshToken,
          avatar: userData.avatar,
        };
        await this.userRepository.save(user);
        return user;
      }

      // Check if user exists with same email but different provider
      const existingEmailUser = await this.userRepository.findOne({
        where: { email: userData.email },
      });

      if (existingEmailUser) {
        // Link OAuth account to existing email account
        existingEmailUser.provider = userData.provider as AuthProvider;
        existingEmailUser.providerId = userData.providerId;
        existingEmailUser.providerData = {
          accessToken: userData.accessToken,
          refreshToken: userData.refreshToken,
          avatar: userData.avatar,
        };
        existingEmailUser.emailVerified = true; // OAuth emails are considered verified
        existingEmailUser.lastActivityAt = new Date();
        
        await this.userRepository.save(existingEmailUser);
        return existingEmailUser;
      }

      // Create new OAuth user
      const newUser = this.userRepository.create({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        provider: userData.provider as AuthProvider,
        providerId: userData.providerId,
        providerData: {
          accessToken: userData.accessToken,
          refreshToken: userData.refreshToken,
          avatar: userData.avatar,
        },
        emailVerified: true, // OAuth emails are considered verified
        role: UserRole.USER,
        lastActivityAt: new Date(),
        // No password hash for OAuth users
      });

      const savedUser = await this.userRepository.save(newUser);
      
      // Here you could integrate with wallet service to create wallet
      // await this.walletService.createWallet(savedUser.id);

      return savedUser;
    } catch (error) {
      throw new BadRequestException('Failed to process OAuth authentication');
    }
  }

  /**
   * Enhanced email/password registration with better validation
   */
  async registerWithEmail(email: string, password: string, firstName: string, lastName: string): Promise<AuthResponse> {
    try {
      // Enhanced email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new BadRequestException('Invalid email format');
      }

      // Enhanced password validation
      if (password.length < 8) {
        throw new BadRequestException('Password must be at least 8 characters long');
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
      if (!passwordRegex.test(password)) {
        throw new BadRequestException('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
      }

      // Check if email already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        throw new ConflictException('Email already registered');
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const newUser = this.userRepository.create({
        email: email.toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        passwordHash,
        provider: AuthProvider.LOCAL,
        role: UserRole.USER,
        emailVerified: false, // Require email verification for local accounts
        lastActivityAt: new Date(),
      });

      const savedUser = await this.userRepository.save(newUser);
      
      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = savedUser;
      
      // Generate access token
      const payload = this.createTokenPayload(savedUser);
      const accessToken = this.jwtService.sign(payload);

      // Here you could:
      // 1. Send email verification
      // 2. Create wallet for the user
      // 3. Send welcome notification

      return {
        user: userWithoutPassword,
        accessToken,
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create account');
    }
  }

  /**
   * Enhanced login with better security
   */
  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    try {
      const user = await this.userRepository.findOne({
        where: { 
          email: email.toLowerCase(),
          provider: AuthProvider.LOCAL,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const unlockTime = user.lockedUntil.toLocaleString();
        throw new UnauthorizedException(`Account is locked until ${unlockTime}`);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      
      if (!isPasswordValid) {
        // Increment failed login attempts
        const failedAttempts = (user.failedLoginAttempts || 0) + 1;
        const updateData: any = { 
          failedLoginAttempts: failedAttempts,
          lastActivityAt: new Date(),
        };

        // Lock account after 5 failed attempts
        if (failedAttempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        }

        await this.userRepository.update(user.id, updateData);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Reset failed login attempts on successful login
      await this.userRepository.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastActivityAt: new Date(),
      });

      // Remove sensitive data from response
      const { passwordHash, twoFactorSecret, twoFactorBackupCodes, ...userWithoutSensitiveData } = user;
      
      // Generate access token
      const payload = this.createTokenPayload(user);
      const accessToken = this.jwtService.sign(payload);

      return {
        user: userWithoutSensitiveData,
        accessToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException('Failed to authenticate');
    }
  }

  /**
   * Generate JWT token (for OAuth callbacks)
   */
  generateToken(payload: any): string {
    return this.jwtService.sign(payload);
  }
}