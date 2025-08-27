import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ethers } from 'ethers';
import * as IPFS from 'ipfs-http-client';
import { create } from 'multiformats/cid';

import { Workflow, User } from '../../../api/src/entities';

export interface BlockchainWorkflow {
  id: string;
  tokenId?: number;
  workflowId: string;
  ownerAddress: string;
  creatorAddress: string;
  ipfsHash: string;
  contractAddress: string;
  networkId: number;
  isNFT: boolean;
  mintedAt?: Date;
  price?: string;
  royaltyPercentage?: number;
  executionCount: number;
  revenue: string;
}

export interface Web3Transaction {
  id: string;
  type: 'mint' | 'transfer' | 'execute' | 'stake' | 'vote' | 'purchase';
  userAddress: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  gasPrice?: string;
  value?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Web3User {
  userId: string;
  walletAddress: string;
  ensName?: string;
  sbaroBalance: string;
  stakedBalance: string;
  votingPower: string;
  nftCount: number;
  createdWorkflows: number;
  executedWorkflows: number;
  totalRevenue: string;
  reputationScore: number;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/web3',
})
export class Web3IntegrationService {
  private readonly logger = new Logger(Web3IntegrationService.name);
  
  @WebSocketServer()
  server: Server;

  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private ipfsClient: any;
  
  // Contract instances
  private sbaroTokenContract: ethers.Contract;
  private workflowNFTContract: ethers.Contract;
  private daoContract: ethers.Contract;
  
  // Contract addresses and ABIs
  private contractAddresses = {
    sbaroToken: '',
    workflowNFT: '',
    dao: '',
  };

  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    
    @InjectRepository(User)
    private userRepository: Repository<User>,
    
    private configService: ConfigService,
  ) {
    this.initializeWeb3();
  }

  /**
   * Initialize Web3 connections and contracts
   */
  private async initializeWeb3(): Promise<void> {
    try {
      // Initialize Ethereum provider
      const rpcUrl = this.configService.get<string>('ETHEREUM_RPC_URL') || 'http://localhost:8545';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Initialize signer (for contract interactions)
      const privateKey = this.configService.get<string>('ETHEREUM_PRIVATE_KEY');
      if (privateKey) {
        this.signer = new ethers.Wallet(privateKey, this.provider);
      }

      // Initialize IPFS client
      this.ipfsClient = IPFS.create({
        host: this.configService.get<string>('IPFS_HOST') || 'localhost',
        port: this.configService.get<number>('IPFS_PORT') || 5001,
        protocol: this.configService.get<string>('IPFS_PROTOCOL') || 'http',
      });

      // Load contract addresses
      this.contractAddresses = {
        sbaroToken: this.configService.get<string>('SBARO_TOKEN_ADDRESS') || '',
        workflowNFT: this.configService.get<string>('WORKFLOW_NFT_ADDRESS') || '',
        dao: this.configService.get<string>('DAO_ADDRESS') || '',
      };

      // Initialize contract instances
      await this.initializeContracts();
      
      this.logger.log('Web3 integration initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Web3 integration:', error);
    }
  }

  private async initializeContracts(): Promise<void> {
    // Load contract ABIs (in production, these would be imported from build artifacts)
    const sbaroTokenABI = await this.loadContractABI('SbaroToken');
    const workflowNFTABI = await this.loadContractABI('SbaroWorkflowNFT');
    const daoABI = await this.loadContractABI('SbaroDAO');

    if (this.signer) {
      this.sbaroTokenContract = new ethers.Contract(
        this.contractAddresses.sbaroToken,
        sbaroTokenABI,
        this.signer
      );

      this.workflowNFTContract = new ethers.Contract(
        this.contractAddresses.workflowNFT,
        workflowNFTABI,
        this.signer
      );

      this.daoContract = new ethers.Contract(
        this.contractAddresses.dao,
        daoABI,
        this.signer
      );
    }
  }

  /**
   * Mint workflow as NFT
   */
  async mintWorkflowNFT(
    workflowId: string,
    userAddress: string,
    royaltyPercentage: number = 500 // 5%
  ): Promise<{ tokenId: number; txHash: string; ipfsHash: string }> {
    try {
      const workflow = await this.workflowRepository.findOne({
        where: { id: workflowId },
        relations: ['nodes', 'connections'],
      });

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Upload workflow to IPFS
      const ipfsHash = await this.uploadWorkflowToIPFS(workflow);

      // Mint NFT
      const tx = await this.workflowNFTContract.mintWorkflow(
        userAddress,
        workflow.name,
        workflow.description || '',
        'automation', // category
        ipfsHash,
        royaltyPercentage
      );

      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Extract token ID from events
      const mintEvent = receipt.events?.find((e: any) => e.event === 'WorkflowMinted');
      const tokenId = mintEvent?.args?.tokenId?.toNumber();

      // Record transaction
      await this.recordTransaction({
        type: 'mint',
        userAddress,
        txHash: tx.hash,
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        metadata: { workflowId, tokenId, ipfsHash },
      });

      // Emit event
      this.server.emit('workflow-minted', {
        workflowId,
        tokenId,
        txHash: tx.hash,
        ipfsHash,
        userAddress,
      });

      this.logger.log(`Workflow ${workflowId} minted as NFT #${tokenId}`);

      return { tokenId, txHash: tx.hash, ipfsHash };
    } catch (error) {
      this.logger.error('Failed to mint workflow NFT:', error);
      throw error;
    }
  }

  /**
   * Execute workflow on blockchain
   */
  async executeWorkflowOnChain(
    tokenId: number,
    executorAddress: string,
    executionData: any
  ): Promise<string> {
    try {
      // Hash execution data
      const dataHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(executionData))
      );

      // Execute workflow on contract
      const tx = await this.workflowNFTContract.executeWorkflow(
        tokenId,
        dataHash,
        executionData.success || true,
        executionData.gasUsed || 0
      );

      const receipt = await tx.wait();

      // Record transaction
      await this.recordTransaction({
        type: 'execute',
        userAddress: executorAddress,
        txHash: tx.hash,
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        metadata: { tokenId, dataHash, executionData },
      });

      // Emit event
      this.server.emit('workflow-executed', {
        tokenId,
        executorAddress,
        txHash: tx.hash,
        success: executionData.success,
      });

      return tx.hash;
    } catch (error) {
      this.logger.error('Failed to execute workflow on blockchain:', error);
      throw error;
    }
  }

  /**
   * Purchase workflow NFT
   */
  async purchaseWorkflowNFT(
    tokenId: number,
    buyerAddress: string,
    priceInWei: string
  ): Promise<string> {
    try {
      const tx = await this.workflowNFTContract.purchaseWorkflow(tokenId, {
        value: priceInWei,
      });

      const receipt = await tx.wait();

      // Record transaction
      await this.recordTransaction({
        type: 'purchase',
        userAddress: buyerAddress,
        txHash: tx.hash,
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        value: priceInWei,
        metadata: { tokenId },
      });

      // Emit event
      this.server.emit('workflow-purchased', {
        tokenId,
        buyerAddress,
        txHash: tx.hash,
        price: priceInWei,
      });

      return tx.hash;
    } catch (error) {
      this.logger.error('Failed to purchase workflow NFT:', error);
      throw error;
    }
  }

  /**
   * Stake SBARO tokens
   */
  async stakeTokens(
    userAddress: string,
    amount: string,
    lockPeriod: number
  ): Promise<string> {
    try {
      const tx = await this.sbaroTokenContract.stakeTokens(amount, lockPeriod);
      const receipt = await tx.wait();

      // Record transaction
      await this.recordTransaction({
        type: 'stake',
        userAddress,
        txHash: tx.hash,
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        value: amount,
        metadata: { lockPeriod },
      });

      // Emit event
      this.server.emit('tokens-staked', {
        userAddress,
        amount,
        lockPeriod,
        txHash: tx.hash,
      });

      return tx.hash;
    } catch (error) {
      this.logger.error('Failed to stake tokens:', error);
      throw error;
    }
  }

  /**
   * Create DAO proposal
   */
  async createDAOProposal(
    proposerAddress: string,
    targets: string[],
    values: string[],
    calldatas: string[],
    description: string,
    proposalType: number,
    title: string,
    tags: string[]
  ): Promise<{ proposalId: string; txHash: string }> {
    try {
      const tx = await this.daoContract.proposeWithMetadata(
        targets,
        values,
        calldatas,
        description,
        proposalType,
        title,
        tags,
        0 // execution cost
      );

      const receipt = await tx.wait();
      
      // Extract proposal ID from events
      const proposalEvent = receipt.events?.find((e: any) => e.event === 'ProposalCreated');
      const proposalId = proposalEvent?.args?.proposalId?.toString();

      // Record transaction
      await this.recordTransaction({
        type: 'vote', // Using 'vote' type for DAO interactions
        userAddress: proposerAddress,
        txHash: tx.hash,
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        metadata: { proposalId, title, proposalType },
      });

      // Emit event
      this.server.emit('proposal-created', {
        proposalId,
        proposerAddress,
        title,
        txHash: tx.hash,
      });

      return { proposalId, txHash: tx.hash };
    } catch (error) {
      this.logger.error('Failed to create DAO proposal:', error);
      throw error;
    }
  }

  /**
   * Vote on DAO proposal
   */
  async voteOnProposal(
    voterAddress: string,
    proposalId: string,
    support: number,
    comment: string = ''
  ): Promise<string> {
    try {
      const tx = comment 
        ? await this.daoContract.castVoteWithComment(proposalId, support, comment)
        : await this.daoContract.castVote(proposalId, support);

      const receipt = await tx.wait();

      // Record transaction
      await this.recordTransaction({
        type: 'vote',
        userAddress: voterAddress,
        txHash: tx.hash,
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        metadata: { proposalId, support, comment },
      });

      // Emit event
      this.server.emit('vote-cast', {
        proposalId,
        voterAddress,
        support,
        txHash: tx.hash,
      });

      return tx.hash;
    } catch (error) {
      this.logger.error('Failed to vote on proposal:', error);
      throw error;
    }
  }

  /**
   * Get user's Web3 profile
   */
  async getUserWeb3Profile(userAddress: string): Promise<Web3User> {
    try {
      // Get SBARO token balance
      const sbaroBalance = await this.sbaroTokenContract.balanceOf(userAddress);
      
      // Get staking info
      const stakingInfo = await this.sbaroTokenContract.getUserStakingInfo(userAddress);
      
      // Get voting power
      const votingPower = await this.sbaroTokenContract.votingPower(userAddress);
      
      // Get NFT count
      const nftBalance = await this.workflowNFTContract.balanceOf(userAddress);
      
      // Get created workflows
      const createdWorkflows = await this.workflowNFTContract.getCreatorWorkflows(userAddress);
      
      // Calculate other metrics (simplified for demo)
      const profile: Web3User = {
        userId: '', // Would be linked to traditional user ID
        walletAddress: userAddress,
        ensName: await this.resolveENSName(userAddress),
        sbaroBalance: ethers.formatEther(sbaroBalance),
        stakedBalance: ethers.formatEther(stakingInfo.totalAmount),
        votingPower: ethers.formatEther(votingPower),
        nftCount: nftBalance.toNumber(),
        createdWorkflows: createdWorkflows.length,
        executedWorkflows: 0, // Would be calculated from execution history
        totalRevenue: '0', // Would be calculated from NFT sales/royalties
        reputationScore: 100, // Would be calculated based on various factors
      };

      return profile;
    } catch (error) {
      this.logger.error('Failed to get user Web3 profile:', error);
      throw error;
    }
  }

  /**
   * Get marketplace listings
   */
  async getMarketplaceListings(): Promise<any[]> {
    try {
      const [tokenIds, prices] = await this.workflowNFTContract.getWorkflowsForSale();
      
      const listings = [];
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i].toNumber();
        const price = ethers.formatEther(prices[i]);
        const metadata = await this.workflowNFTContract.workflowMetadata(tokenId);
        const tokenURI = await this.workflowNFTContract.tokenURI(tokenId);
        
        listings.push({
          tokenId,
          price,
          name: metadata.name,
          description: metadata.description,
          category: metadata.category,
          creator: metadata.creator,
          executionCount: metadata.executionCount.toNumber(),
          ipfsHash: tokenURI,
          createdAt: new Date(metadata.createdAt.toNumber() * 1000),
        });
      }

      return listings;
    } catch (error) {
      this.logger.error('Failed to get marketplace listings:', error);
      throw error;
    }
  }

  /**
   * Get active DAO proposals
   */
  async getActiveProposals(): Promise<any[]> {
    try {
      // This would require querying proposal events and checking their state
      // For now, returning a simplified structure
      const proposals = [];
      
      // In a real implementation, you would:
      // 1. Query ProposalCreated events
      // 2. Check proposal state for each
      // 3. Get proposal metadata
      // 4. Return formatted proposal data
      
      return proposals;
    } catch (error) {
      this.logger.error('Failed to get active proposals:', error);
      throw error;
    }
  }

  /**
   * Upload workflow definition to IPFS
   */
  private async uploadWorkflowToIPFS(workflow: any): Promise<string> {
    try {
      const workflowData = {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        version: '1.0.0',
        nodes: workflow.nodes || [],
        connections: workflow.connections || [],
        metadata: {
          created_at: workflow.createdAt,
          sbaro_version: '2.0.0',
          creator: workflow.ownerId,
        },
      };

      const { cid } = await this.ipfsClient.add(JSON.stringify(workflowData, null, 2));
      return cid.toString();
    } catch (error) {
      this.logger.error('Failed to upload workflow to IPFS:', error);
      throw error;
    }
  }

  /**
   * Download workflow from IPFS
   */
  async downloadWorkflowFromIPFS(ipfsHash: string): Promise<any> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(ipfsHash)) {
        chunks.push(chunk);
      }
      
      const data = Buffer.concat(chunks);
      return JSON.parse(data.toString());
    } catch (error) {
      this.logger.error('Failed to download workflow from IPFS:', error);
      throw error;
    }
  }

  /**
   * Record blockchain transaction
   */
  private async recordTransaction(txData: Partial<Web3Transaction>): Promise<void> {
    try {
      // In a real implementation, save to database
      this.logger.log(`Transaction recorded: ${txData.txHash} (${txData.type})`);
    } catch (error) {
      this.logger.error('Failed to record transaction:', error);
    }
  }

  /**
   * Resolve ENS name for address
   */
  private async resolveENSName(address: string): Promise<string | undefined> {
    try {
      return await this.provider.lookupAddress(address);
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Load contract ABI (placeholder implementation)
   */
  private async loadContractABI(contractName: string): Promise<any[]> {
    // In a real implementation, load from compiled artifacts
    // For now, return empty array
    return [];
  }

  /**
   * Get blockchain network info
   */
  async getNetworkInfo(): Promise<{
    chainId: number;
    blockNumber: number;
    gasPrice: string;
    networkName: string;
  }> {
    try {
      const network = await this.provider.getNetwork();
      const blockNumber = await this.provider.getBlockNumber();
      const feeData = await this.provider.getFeeData();

      return {
        chainId: Number(network.chainId),
        blockNumber,
        gasPrice: ethers.formatUnits(feeData.gasPrice || 0, 'gwei'),
        networkName: network.name,
      };
    } catch (error) {
      this.logger.error('Failed to get network info:', error);
      throw error;
    }
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(
    contractMethod: string,
    params: any[]
  ): Promise<{ gasEstimate: string; gasCost: string }> {
    try {
      // This would estimate gas for specific contract methods
      // For now, return mock estimates
      return {
        gasEstimate: '150000',
        gasCost: '0.005', // in ETH
      };
    } catch (error) {
      this.logger.error('Failed to estimate gas:', error);
      throw error;
    }
  }

  /**
   * Monitor blockchain events
   */
  startEventMonitoring(): void {
    try {
      // Monitor Workflow NFT events
      if (this.workflowNFTContract) {
        this.workflowNFTContract.on('WorkflowMinted', (tokenId, creator, name, ipfsHash) => {
          this.server.emit('workflow-minted', {
            tokenId: tokenId.toNumber(),
            creator,
            name,
            ipfsHash,
          });
        });

        this.workflowNFTContract.on('WorkflowExecuted', (tokenId, executor, success, gasUsed) => {
          this.server.emit('workflow-executed', {
            tokenId: tokenId.toNumber(),
            executor,
            success,
            gasUsed: gasUsed.toString(),
          });
        });

        this.workflowNFTContract.on('WorkflowSale', (tokenId, seller, buyer, price) => {
          this.server.emit('workflow-sale', {
            tokenId: tokenId.toNumber(),
            seller,
            buyer,
            price: ethers.formatEther(price),
          });
        });
      }

      // Monitor SBARO Token events
      if (this.sbaroTokenContract) {
        this.sbaroTokenContract.on('TokensStaked', (user, amount, lockPeriod) => {
          this.server.emit('tokens-staked', {
            user,
            amount: ethers.formatEther(amount),
            lockPeriod: lockPeriod.toNumber(),
          });
        });

        this.sbaroTokenContract.on('RewardsDistributed', (recipient, amount, reason) => {
          this.server.emit('rewards-distributed', {
            recipient,
            amount: ethers.formatEther(amount),
            reason,
          });
        });
      }

      // Monitor DAO events
      if (this.daoContract) {
        this.daoContract.on('ProposalCreatedWithMetadata', (proposalId, proposer, proposalType, title) => {
          this.server.emit('proposal-created', {
            proposalId: proposalId.toString(),
            proposer,
            proposalType: proposalType.toNumber(),
            title,
          });
        });

        this.daoContract.on('VoteCastWithComment', (voter, proposalId, support, comment, weight) => {
          this.server.emit('vote-cast', {
            voter,
            proposalId: proposalId.toString(),
            support: support.toNumber(),
            comment,
            weight: ethers.formatEther(weight),
          });
        });
      }

      this.logger.log('Blockchain event monitoring started');
    } catch (error) {
      this.logger.error('Failed to start event monitoring:', error);
    }
  }
}