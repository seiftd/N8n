import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import * as semver from 'semver';
import * as JSZip from 'jszip';
import { marked } from 'marked';
import * as sanitizeHtml from 'sanitize-html';

import {
  MarketplaceTemplate,
  TemplateCategory,
  TemplateStatus,
  TemplateVisibility,
  TemplateReview,
  TemplateDownload,
  TemplateVersion,
} from '../entities/marketplace-template.entity';

export interface TemplateSearchQuery {
  query?: string;
  category?: TemplateCategory;
  tags?: string[];
  author?: string;
  rating?: number;
  price?: 'free' | 'paid' | 'any';
  sortBy?: 'relevance' | 'downloads' | 'rating' | 'date' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TemplateSearchResult {
  templates: MarketplaceTemplate[];
  total: number;
  page: number;
  limit: number;
  filters: {
    categories: Array<{ category: TemplateCategory; count: number }>;
    tags: Array<{ tag: string; count: number }>;
    authors: Array<{ author: string; count: number }>;
  };
}

export interface CreateTemplateDto {
  name: string;
  description: string;
  readme?: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  workflowDefinition: any;
  tags: string[];
  useCases: string[];
  requirements?: any;
  configuration?: any;
  price?: number;
  currency?: string;
}

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(MarketplaceTemplate)
    private templateRepository: Repository<MarketplaceTemplate>,

    @InjectRepository(TemplateReview)
    private reviewRepository: Repository<TemplateReview>,

    @InjectRepository(TemplateDownload)
    private downloadRepository: Repository<TemplateDownload>,

    @InjectRepository(TemplateVersion)
    private versionRepository: Repository<TemplateVersion>,

    private elasticsearchService: ElasticsearchService,
  ) {}

  /**
   * Search templates with advanced filtering and relevance scoring
   */
  async searchTemplates(query: TemplateSearchQuery): Promise<TemplateSearchResult> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    try {
      // Build Elasticsearch query
      const searchQuery = this.buildElasticsearchQuery(query);

      const response = await this.elasticsearchService.search({
        index: 'marketplace_templates',
        body: {
          query: searchQuery,
          sort: this.buildSortCriteria(query.sortBy, query.sortOrder),
          from: offset,
          size: limit,
          aggs: {
            categories: {
              terms: { field: 'category', size: 20 },
            },
            tags: {
              terms: { field: 'tags', size: 50 },
            },
            authors: {
              terms: { field: 'author.name', size: 20 },
            },
          },
        },
      });

      const templateIds = response.body.hits.hits.map((hit: any) => hit._source.id);
      
      // Fetch full template objects from database
      const templates = await this.templateRepository.find({
        where: { id: In(templateIds), status: TemplateStatus.APPROVED },
        relations: ['author', 'reviews'],
        order: this.buildDatabaseSort(query.sortBy, query.sortOrder),
      });

      // Build filters from aggregations
      const filters = {
        categories: response.body.aggregations.categories.buckets.map((bucket: any) => ({
          category: bucket.key,
          count: bucket.doc_count,
        })),
        tags: response.body.aggregations.tags.buckets.map((bucket: any) => ({
          tag: bucket.key,
          count: bucket.doc_count,
        })),
        authors: response.body.aggregations.authors.buckets.map((bucket: any) => ({
          author: bucket.key,
          count: bucket.doc_count,
        })),
      };

      return {
        templates,
        total: response.body.hits.total.value,
        page,
        limit,
        filters,
      };

    } catch (error) {
      this.logger.error('Elasticsearch search failed, falling back to database search', error);
      return this.fallbackDatabaseSearch(query);
    }
  }

  /**
   * Get template details with usage analytics
   */
  async getTemplate(id: string, userId?: string): Promise<MarketplaceTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id, status: TemplateStatus.APPROVED },
      relations: ['author', 'reviews', 'reviews.user', 'versions'],
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Increment view count
    await this.templateRepository.increment({ id }, 'viewCount', 1);

    // Update analytics
    await this.updateTemplateAnalytics(id);

    return template;
  }

  /**
   * Create new template
   */
  async createTemplate(
    authorId: string,
    createDto: CreateTemplateDto,
  ): Promise<MarketplaceTemplate> {
    // Validate workflow definition
    this.validateWorkflowDefinition(createDto.workflowDefinition);

    // Generate initial version
    const version = '1.0.0';

    const template = this.templateRepository.create({
      ...createDto,
      authorId,
      version,
      status: TemplateStatus.PENDING_REVIEW,
      readme: createDto.readme ? this.sanitizeMarkdown(createDto.readme) : undefined,
    });

    const savedTemplate = await this.templateRepository.save(template);

    // Create initial version record
    await this.versionRepository.save({
      templateId: savedTemplate.id,
      version,
      workflowDefinition: createDto.workflowDefinition,
      isActive: true,
    });

    // Index in Elasticsearch
    await this.indexTemplate(savedTemplate);

    this.logger.log(`Template created: ${savedTemplate.id} by user ${authorId}`);
    return savedTemplate;
  }

  /**
   * Update template
   */
  async updateTemplate(
    id: string,
    authorId: string,
    updateDto: Partial<CreateTemplateDto>,
  ): Promise<MarketplaceTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id, authorId },
    });

    if (!template) {
      throw new NotFoundException('Template not found or unauthorized');
    }

    // Check if workflow definition changed (new version needed)
    let newVersion = template.version;
    if (updateDto.workflowDefinition) {
      this.validateWorkflowDefinition(updateDto.workflowDefinition);
      newVersion = semver.inc(template.version, 'minor') || template.version;
    }

    Object.assign(template, {
      ...updateDto,
      version: newVersion,
      lastUpdatedAt: new Date(),
      readme: updateDto.readme ? this.sanitizeMarkdown(updateDto.readme) : template.readme,
    });

    const savedTemplate = await this.templateRepository.save(template);

    // Create new version if workflow changed
    if (updateDto.workflowDefinition && newVersion !== template.version) {
      // Deactivate old versions
      await this.versionRepository.update(
        { templateId: id },
        { isActive: false }
      );

      // Create new version
      await this.versionRepository.save({
        templateId: id,
        version: newVersion,
        workflowDefinition: updateDto.workflowDefinition,
        isActive: true,
      });
    }

    // Update search index
    await this.indexTemplate(savedTemplate);

    return savedTemplate;
  }

  /**
   * Download template
   */
  async downloadTemplate(
    templateId: string,
    userId?: string,
    userInfo?: { ipAddress: string; userAgent: string; country?: string },
  ): Promise<{ downloadUrl: string; template: MarketplaceTemplate }> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, status: TemplateStatus.APPROVED },
      relations: ['author', 'versions'],
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check if user has access (for premium templates)
    if (template.isPremium) {
      await this.validatePremiumAccess(templateId, userId);
    }

    // Record download
    await this.downloadRepository.save({
      templateId,
      userId,
      ipAddress: userInfo?.ipAddress,
      userAgent: userInfo?.userAgent,
      country: userInfo?.country,
      isPremiumDownload: template.isPremium,
    });

    // Increment download count
    await this.templateRepository.increment({ id: templateId }, 'downloadCount', 1);

    // Generate download package
    const downloadUrl = await this.generateDownloadPackage(template);

    return { downloadUrl, template };
  }

  /**
   * Add template review
   */
  async addReview(
    templateId: string,
    userId: string,
    rating: number,
    comment?: string,
  ): Promise<TemplateReview> {
    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Check if user already reviewed
    const existingReview = await this.reviewRepository.findOne({
      where: { templateId, userId },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this template');
    }

    // Check if user has downloaded/used the template
    const hasDownloaded = await this.downloadRepository.findOne({
      where: { templateId, userId },
    });

    const review = this.reviewRepository.create({
      templateId,
      userId,
      rating,
      comment: comment ? this.sanitizeComment(comment) : undefined,
      isVerified: !!hasDownloaded,
    });

    const savedReview = await this.reviewRepository.save(review);

    // Update template rating
    await this.updateTemplateRating(templateId);

    return savedReview;
  }

  /**
   * Fork template
   */
  async forkTemplate(
    originalTemplateId: string,
    userId: string,
    forkData: {
      name: string;
      description: string;
      reason?: string;
    },
  ): Promise<MarketplaceTemplate> {
    const originalTemplate = await this.templateRepository.findOne({
      where: { id: originalTemplateId, status: TemplateStatus.APPROVED },
      relations: ['versions'],
    });

    if (!originalTemplate) {
      throw new NotFoundException('Original template not found');
    }

    const activeVersion = originalTemplate.versions.find(v => v.isActive);
    if (!activeVersion) {
      throw new BadRequestException('No active version found');
    }

    // Create forked template
    const forkedTemplate = this.templateRepository.create({
      name: forkData.name,
      description: forkData.description,
      category: originalTemplate.category,
      visibility: TemplateVisibility.PRIVATE, // Start as private
      authorId: userId,
      version: '1.0.0',
      workflowDefinition: activeVersion.workflowDefinition,
      tags: [...originalTemplate.tags, 'fork'],
      useCases: originalTemplate.useCases,
      requirements: originalTemplate.requirements,
      configuration: originalTemplate.configuration,
    });

    const savedFork = await this.templateRepository.save(forkedTemplate);

    // Create version record
    await this.versionRepository.save({
      templateId: savedFork.id,
      version: '1.0.0',
      workflowDefinition: activeVersion.workflowDefinition,
      isActive: true,
    });

    // Record fork relationship
    // Note: You would create a TemplateFork entity here

    // Increment fork count
    await this.templateRepository.increment({ id: originalTemplateId }, 'forkCount', 1);

    return savedFork;
  }

  /**
   * Get featured templates
   */
  async getFeaturedTemplates(limit = 10): Promise<MarketplaceTemplate[]> {
    return this.templateRepository.find({
      where: { 
        status: TemplateStatus.APPROVED, 
        isFeatured: true,
        visibility: TemplateVisibility.PUBLIC,
      },
      relations: ['author'],
      order: { downloadCount: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get trending templates
   */
  async getTrendingTemplates(limit = 10): Promise<MarketplaceTemplate[]> {
    // Templates with high recent download activity
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const trendingQuery = `
      SELECT t.*, COUNT(d.id) as recent_downloads
      FROM marketplace_templates t
      LEFT JOIN template_downloads d ON t.id = d.templateId 
        AND d.createdAt >= $1
      WHERE t.status = $2 AND t.visibility = $3
      GROUP BY t.id
      ORDER BY recent_downloads DESC, t.rating DESC
      LIMIT $4
    `;

    const results = await this.templateRepository.query(trendingQuery, [
      oneWeekAgo,
      TemplateStatus.APPROVED,
      TemplateVisibility.PUBLIC,
      limit,
    ]);

    return results;
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(userId: string, limit = 10): Promise<MarketplaceTemplate[]> {
    // Get user's download/usage history
    const userDownloads = await this.downloadRepository.find({
      where: { userId },
      relations: ['template'],
      take: 50,
    });

    if (userDownloads.length === 0) {
      return this.getFeaturedTemplates(limit);
    }

    // Extract user preferences
    const userCategories = [...new Set(userDownloads.map(d => d.template.category))];
    const userTags = [...new Set(userDownloads.flatMap(d => d.template.tags))];

    // Find similar templates
    const recommendations = await this.templateRepository.find({
      where: [
        { category: In(userCategories), status: TemplateStatus.APPROVED },
        { tags: In(userTags), status: TemplateStatus.APPROVED },
      ],
      relations: ['author'],
      order: { rating: 'DESC', downloadCount: 'DESC' },
      take: limit * 2, // Get more to filter out already downloaded
    });

    // Filter out already downloaded templates
    const downloadedIds = new Set(userDownloads.map(d => d.template.id));
    const filtered = recommendations.filter(t => !downloadedIds.has(t.id));

    return filtered.slice(0, limit);
  }

  // Helper methods
  private buildElasticsearchQuery(query: TemplateSearchQuery): any {
    const must: any[] = [
      { term: { status: TemplateStatus.APPROVED } },
    ];

    const should: any[] = [];
    const filter: any[] = [];

    // Text search
    if (query.query) {
      should.push(
        { match: { name: { query: query.query, boost: 3 } } },
        { match: { description: { query: query.query, boost: 2 } } },
        { match: { tags: { query: query.query, boost: 1.5 } } },
        { match: { readme: { query: query.query, boost: 1 } } },
      );
    }

    // Category filter
    if (query.category) {
      filter.push({ term: { category: query.category } });
    }

    // Tags filter
    if (query.tags && query.tags.length > 0) {
      filter.push({ terms: { tags: query.tags } });
    }

    // Author filter
    if (query.author) {
      filter.push({ term: { 'author.name': query.author } });
    }

    // Rating filter
    if (query.rating) {
      filter.push({ range: { rating: { gte: query.rating } } });
    }

    // Price filter
    if (query.price === 'free') {
      filter.push({ bool: { must_not: { exists: { field: 'price' } } } });
    } else if (query.price === 'paid') {
      filter.push({ exists: { field: 'price' } });
    }

    return {
      bool: {
        must: should.length > 0 ? [{ bool: { should } }] : must,
        filter,
      },
    };
  }

  private buildSortCriteria(sortBy?: string, sortOrder?: string): any[] {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'downloads':
        return [{ downloadCount: { order } }];
      case 'rating':
        return [{ rating: { order } }, { reviewCount: { order } }];
      case 'date':
        return [{ publishedAt: { order } }];
      case 'name':
        return [{ 'name.keyword': { order } }];
      default:
        return [{ _score: { order: 'desc' } }, { downloadCount: { order: 'desc' } }];
    }
  }

  private buildDatabaseSort(sortBy?: string, sortOrder?: string): any {
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    switch (sortBy) {
      case 'downloads':
        return { downloadCount: order };
      case 'rating':
        return { rating: order, reviewCount: order };
      case 'date':
        return { publishedAt: order };
      case 'name':
        return { name: order };
      default:
        return { downloadCount: 'DESC' };
    }
  }

  private async fallbackDatabaseSearch(query: TemplateSearchQuery): Promise<TemplateSearchResult> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    const queryBuilder = this.templateRepository.createQueryBuilder('template')
      .leftJoinAndSelect('template.author', 'author')
      .where('template.status = :status', { status: TemplateStatus.APPROVED });

    // Add filters
    if (query.query) {
      queryBuilder.andWhere(
        '(template.name ILIKE :search OR template.description ILIKE :search OR :search = ANY(template.tags))',
        { search: `%${query.query}%` }
      );
    }

    if (query.category) {
      queryBuilder.andWhere('template.category = :category', { category: query.category });
    }

    if (query.tags && query.tags.length > 0) {
      queryBuilder.andWhere('template.tags && :tags', { tags: query.tags });
    }

    if (query.rating) {
      queryBuilder.andWhere('template.rating >= :rating', { rating: query.rating });
    }

    if (query.price === 'free') {
      queryBuilder.andWhere('template.price IS NULL');
    } else if (query.price === 'paid') {
      queryBuilder.andWhere('template.price IS NOT NULL');
    }

    // Add sorting
    const orderBy = this.buildDatabaseSort(query.sortBy, query.sortOrder);
    Object.entries(orderBy).forEach(([field, direction]) => {
      queryBuilder.addOrderBy(`template.${field}`, direction as 'ASC' | 'DESC');
    });

    const [templates, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      templates,
      total,
      page,
      limit,
      filters: {
        categories: [],
        tags: [],
        authors: [],
      },
    };
  }

  private validateWorkflowDefinition(definition: any): void {
    if (!definition || typeof definition !== 'object') {
      throw new BadRequestException('Invalid workflow definition');
    }

    if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
      throw new BadRequestException('Workflow must contain nodes and edges arrays');
    }

    // Additional validation can be added here
  }

  private sanitizeMarkdown(markdown: string): string {
    const html = marked(markdown);
    return sanitizeHtml(html, {
      allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'strong', 'em', 'u', 's',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      allowedAttributes: {
        a: ['href', 'title'],
        img: ['src', 'alt', 'width', 'height'],
      },
    });
  }

  private sanitizeComment(comment: string): string {
    return sanitizeHtml(comment, {
      allowedTags: ['p', 'br', 'strong', 'em'],
      allowedAttributes: {},
    });
  }

  private async indexTemplate(template: MarketplaceTemplate): Promise<void> {
    try {
      await this.elasticsearchService.index({
        index: 'marketplace_templates',
        id: template.id,
        body: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          tags: template.tags,
          rating: template.rating,
          downloadCount: template.downloadCount,
          status: template.status,
          visibility: template.visibility,
          publishedAt: template.publishedAt,
          author: {
            id: template.authorId,
            name: template.author?.fullName,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to index template in Elasticsearch', error);
    }
  }

  private async updateTemplateAnalytics(templateId: string): Promise<void> {
    // Update weekly/monthly download counts and other analytics
    // This would typically be done via a scheduled job
  }

  private async updateTemplateRating(templateId: string): Promise<void> {
    const result = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(review.id)', 'reviewCount')
      .where('review.templateId = :templateId', { templateId })
      .getRawOne();

    await this.templateRepository.update(templateId, {
      rating: parseFloat(result.avgRating) || 0,
      reviewCount: parseInt(result.reviewCount) || 0,
    });
  }

  private async validatePremiumAccess(templateId: string, userId?: string): Promise<void> {
    if (!userId) {
      throw new BadRequestException('Authentication required for premium template');
    }

    // Check if user has purchased this template
    // Implementation would check payment/subscription status
  }

  private async generateDownloadPackage(template: MarketplaceTemplate): Promise<string> {
    const zip = new JSZip();

    // Add workflow definition
    zip.file('workflow.json', JSON.stringify(template.workflowDefinition, null, 2));

    // Add metadata
    zip.file('template.json', JSON.stringify({
      name: template.name,
      description: template.description,
      version: template.version,
      author: template.author?.fullName,
      category: template.category,
      tags: template.tags,
      requirements: template.requirements,
      configuration: template.configuration,
    }, null, 2));

    // Add README if available
    if (template.readme) {
      zip.file('README.md', template.readme);
    }

    // Generate and upload to storage
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // In a real implementation, upload to S3/GCS and return URL
    return `https://downloads.sbaro.com/templates/${template.id}.zip`;
  }
}