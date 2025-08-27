// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ISbaroToken {
    function votingPower(address account) external view returns (uint256);
    function distributeRewards(address recipient, uint256 amount, string memory reason) external;
}

/**
 * @title SbaroDAO
 * @dev Decentralized Autonomous Organization for Sbaro platform governance
 * Handles proposals, voting, and community-driven development decisions
 */
contract SbaroDAO is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl,
    Ownable
{
    ISbaroToken public sbaroToken;
    
    enum ProposalType {
        PLATFORM_UPGRADE,
        FEATURE_REQUEST,
        ECONOMIC_PARAMETER,
        TREASURY_ALLOCATION,
        PARTNERSHIP,
        COMMUNITY_GRANT,
        GOVERNANCE_CHANGE
    }
    
    struct ProposalMetadata {
        ProposalType proposalType;
        string title;
        string description;
        string[] tags;
        address proposer;
        uint256 createdAt;
        uint256 executionCost;
        bool isExecuted;
        mapping(address => string) voterComments;
    }
    
    struct CommunityMetrics {
        uint256 totalProposals;
        uint256 totalVotes;
        uint256 totalParticipants;
        uint256 treasuryBalance;
        uint256 lastActivityTimestamp;
    }
    
    mapping(uint256 => ProposalMetadata) public proposalMetadata;
    mapping(address => uint256[]) public userProposals;
    mapping(address => uint256) public userVotingHistory;
    mapping(address => uint256) public contributionScore;
    
    CommunityMetrics public communityMetrics;
    
    // Voting rewards
    uint256 public votingRewardPerProposal = 10 * 10**18; // 10 SBARO per vote
    uint256 public proposalRewardBase = 100 * 10**18; // 100 SBARO for successful proposal
    
    // Proposal requirements
    uint256 public minimumProposalStake = 1000 * 10**18; // 1000 SBARO to create proposal
    uint256 public minimumVotingPower = 100 * 10**18; // 100 SBARO voting power to vote
    
    event ProposalCreatedWithMetadata(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalType proposalType,
        string title
    );
    
    event VoteCastWithComment(
        address indexed voter,
        uint256 indexed proposalId,
        uint8 support,
        string comment,
        uint256 weight
    );
    
    event RewardDistributed(
        address indexed recipient,
        uint256 amount,
        string reason
    );
    
    event CommunityMetricsUpdated(
        uint256 totalProposals,
        uint256 totalVotes,
        uint256 totalParticipants
    );

    constructor(
        IVotes _token,
        TimelockController _timelock,
        address _sbaroTokenAddress
    )
        Governor("SbaroDAO")
        GovernorSettings(1, 45818, 0) // 1 day voting delay, 1 week voting period, 0 proposal threshold
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) // 4% quorum
        GovernorTimelockControl(_timelock)
    {
        sbaroToken = ISbaroToken(_sbaroTokenAddress);
    }

    /**
     * @dev Create a new proposal with enhanced metadata
     */
    function proposeWithMetadata(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalType proposalType,
        string memory title,
        string[] memory tags,
        uint256 executionCost
    ) public returns (uint256) {
        // Check minimum voting power requirement
        require(
            sbaroToken.votingPower(msg.sender) >= minimumProposalStake,
            "Insufficient voting power to create proposal"
        );
        
        // Create the proposal
        uint256 proposalId = propose(targets, values, calldatas, description);
        
        // Store metadata
        ProposalMetadata storage metadata = proposalMetadata[proposalId];
        metadata.proposalType = proposalType;
        metadata.title = title;
        metadata.description = description;
        metadata.tags = tags;
        metadata.proposer = msg.sender;
        metadata.createdAt = block.timestamp;
        metadata.executionCost = executionCost;
        metadata.isExecuted = false;
        
        // Update user proposals
        userProposals[msg.sender].push(proposalId);
        
        // Update community metrics
        communityMetrics.totalProposals++;
        communityMetrics.lastActivityTimestamp = block.timestamp;
        
        // Reward proposer for active participation
        contributionScore[msg.sender] += 50;
        
        emit ProposalCreatedWithMetadata(proposalId, msg.sender, proposalType, title);
        
        return proposalId;
    }

    /**
     * @dev Cast vote with comment and reward system
     */
    function castVoteWithComment(
        uint256 proposalId,
        uint8 support,
        string memory comment
    ) public returns (uint256) {
        // Check minimum voting power
        require(
            sbaroToken.votingPower(msg.sender) >= minimumVotingPower,
            "Insufficient voting power to vote"
        );
        
        // Cast the vote
        uint256 weight = castVote(proposalId, support);
        
        // Store voter comment
        proposalMetadata[proposalId].voterComments[msg.sender] = comment;
        
        // Update voting history
        userVotingHistory[msg.sender]++;
        
        // Update community metrics
        communityMetrics.totalVotes++;
        communityMetrics.lastActivityTimestamp = block.timestamp;
        
        // Distribute voting rewards
        if (votingRewardPerProposal > 0) {
            try sbaroToken.distributeRewards(
                msg.sender,
                votingRewardPerProposal,
                "Voting participation reward"
            ) {
                emit RewardDistributed(msg.sender, votingRewardPerProposal, "Voting reward");
            } catch {
                // Silently fail if reward distribution fails
            }
        }
        
        // Update contribution score
        contributionScore[msg.sender] += 10;
        
        emit VoteCastWithComment(msg.sender, proposalId, support, comment, weight);
        
        return weight;
    }

    /**
     * @dev Execute proposal and handle rewards
     */
    function execute(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public payable override(Governor, GovernorTimelockControl) returns (uint256) {
        uint256 proposalId = hashProposal(targets, values, calldatas, descriptionHash);
        
        // Execute the proposal
        uint256 result = super.execute(targets, values, calldatas, descriptionHash);
        
        // Mark as executed
        proposalMetadata[proposalId].isExecuted = true;
        
        // Reward successful proposer
        address proposer = proposalMetadata[proposalId].proposer;
        if (proposalRewardBase > 0 && proposer != address(0)) {
            try sbaroToken.distributeRewards(
                proposer,
                proposalRewardBase,
                "Successful proposal execution reward"
            ) {
                emit RewardDistributed(proposer, proposalRewardBase, "Proposal execution reward");
            } catch {
                // Silently fail if reward distribution fails
            }
        }
        
        // Update contribution score for proposer
        contributionScore[proposer] += 100;
        
        return result;
    }

    /**
     * @dev Get proposal metadata
     */
    function getProposalMetadata(uint256 proposalId) 
        public view returns (
            ProposalType proposalType,
            string memory title,
            string memory description,
            string[] memory tags,
            address proposer,
            uint256 createdAt,
            uint256 executionCost,
            bool isExecuted
        ) {
        ProposalMetadata storage metadata = proposalMetadata[proposalId];
        return (
            metadata.proposalType,
            metadata.title,
            metadata.description,
            metadata.tags,
            metadata.proposer,
            metadata.createdAt,
            metadata.executionCost,
            metadata.isExecuted
        );
    }

    /**
     * @dev Get voter comment for a proposal
     */
    function getVoterComment(uint256 proposalId, address voter) 
        public view returns (string memory) {
        return proposalMetadata[proposalId].voterComments[voter];
    }

    /**
     * @dev Get user's proposal history
     */
    function getUserProposals(address user) 
        public view returns (uint256[] memory) {
        return userProposals[user];
    }

    /**
     * @dev Get user's governance statistics
     */
    function getUserGovernanceStats(address user) 
        public view returns (
            uint256 totalProposals,
            uint256 totalVotes,
            uint256 contributionPoints,
            uint256 votingPowerAmount
        ) {
        return (
            userProposals[user].length,
            userVotingHistory[user],
            contributionScore[user],
            sbaroToken.votingPower(user)
        );
    }

    /**
     * @dev Get active proposals by type
     */
    function getProposalsByType(ProposalType proposalType) 
        public view returns (uint256[] memory) {
        uint256[] memory allProposals = new uint256[](communityMetrics.totalProposals);
        uint256 count = 0;
        
        for (uint256 i = 1; i <= communityMetrics.totalProposals; i++) {
            if (proposalMetadata[i].proposalType == proposalType && 
                state(i) == ProposalState.Active) {
                allProposals[count] = i;
                count++;
            }
        }
        
        // Resize array
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = allProposals[i];
        }
        
        return result;
    }

    /**
     * @dev Update voting rewards (only through governance)
     */
    function updateVotingRewards(
        uint256 newVotingReward,
        uint256 newProposalReward
    ) public onlyGovernance {
        votingRewardPerProposal = newVotingReward;
        proposalRewardBase = newProposalReward;
    }

    /**
     * @dev Update minimum requirements (only through governance)
     */
    function updateMinimumRequirements(
        uint256 newProposalStake,
        uint256 newVotingPower
    ) public onlyGovernance {
        minimumProposalStake = newProposalStake;
        minimumVotingPower = newVotingPower;
    }

    /**
     * @dev Get community health metrics
     */
    function getCommunityHealth() public view returns (
        uint256 activeProposals,
        uint256 participationRate,
        uint256 averageVotingPower,
        uint256 treasuryBalance
    ) {
        // Count active proposals
        activeProposals = 0;
        for (uint256 i = 1; i <= communityMetrics.totalProposals; i++) {
            if (state(i) == ProposalState.Active) {
                activeProposals++;
            }
        }
        
        // Calculate participation rate (simplified)
        participationRate = communityMetrics.totalParticipants > 0 ? 
            (communityMetrics.totalVotes * 100) / communityMetrics.totalParticipants : 0;
        
        // These would be calculated from actual data in production
        averageVotingPower = 1000 * 10**18; // Placeholder
        treasuryBalance = communityMetrics.treasuryBalance;
        
        return (activeProposals, participationRate, averageVotingPower, treasuryBalance);
    }

    // Override required functions
    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}