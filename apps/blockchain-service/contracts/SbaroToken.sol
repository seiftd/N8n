// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title SbaroToken (SBARO)
 * @dev Native token for the Sbaro ecosystem
 * Used for marketplace transactions, governance, staking, and rewards
 */
contract SbaroToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ReentrancyGuard {
    
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million initial
    
    // Token distribution
    uint256 public constant TEAM_ALLOCATION = 150_000_000 * 10**18; // 15%
    uint256 public constant ECOSYSTEM_ALLOCATION = 300_000_000 * 10**18; // 30%
    uint256 public constant REWARDS_ALLOCATION = 250_000_000 * 10**18; // 25%
    uint256 public constant TREASURY_ALLOCATION = 200_000_000 * 10**18; // 20%
    
    // Vesting and rewards
    mapping(address => uint256) public vestingBalances;
    mapping(address => uint256) public vestingStartTime;
    mapping(address => uint256) public vestingDuration;
    mapping(address => uint256) public rewardBalances;
    
    // Staking
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 lockPeriod;
        uint256 rewardRate;
    }
    
    mapping(address => StakeInfo[]) public userStakes;
    mapping(address => uint256) public totalStaked;
    uint256 public totalStakedSupply;
    
    // Governance
    mapping(address => uint256) public votingPower;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;
    
    event TokensVested(address indexed beneficiary, uint256 amount);
    event TokensStaked(address indexed user, uint256 amount, uint256 lockPeriod);
    event TokensUnstaked(address indexed user, uint256 amount, uint256 reward);
    event RewardsDistributed(address indexed recipient, uint256 amount, string reason);
    event VotingPowerUpdated(address indexed user, uint256 newPower);

    constructor() ERC20("Sbaro Token", "SBARO") {
        // Mint initial supply to deployer
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @dev Set up vesting schedule for team/advisor tokens
     * @param beneficiary Address to receive vested tokens
     * @param amount Total amount to vest
     * @param duration Vesting duration in seconds
     */
    function setupVesting(
        address beneficiary,
        uint256 amount,
        uint256 duration
    ) public onlyOwner {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Amount must be positive");
        require(duration > 0, "Duration must be positive");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        vestingBalances[beneficiary] = amount;
        vestingStartTime[beneficiary] = block.timestamp;
        vestingDuration[beneficiary] = duration;
        
        // Mint tokens to contract for vesting
        _mint(address(this), amount);
    }

    /**
     * @dev Claim vested tokens
     */
    function claimVestedTokens() public nonReentrant {
        uint256 vestedAmount = getVestedAmount(msg.sender);
        require(vestedAmount > 0, "No tokens to claim");
        
        vestingBalances[msg.sender] -= vestedAmount;
        _transfer(address(this), msg.sender, vestedAmount);
        
        emit TokensVested(msg.sender, vestedAmount);
    }

    /**
     * @dev Calculate vested amount for an address
     * @param beneficiary Address to check
     * @return Amount of tokens that can be claimed
     */
    function getVestedAmount(address beneficiary) public view returns (uint256) {
        if (vestingStartTime[beneficiary] == 0) return 0;
        
        uint256 totalVesting = vestingBalances[beneficiary];
        if (totalVesting == 0) return 0;
        
        uint256 elapsedTime = block.timestamp - vestingStartTime[beneficiary];
        uint256 duration = vestingDuration[beneficiary];
        
        if (elapsedTime >= duration) {
            return totalVesting;
        }
        
        return (totalVesting * elapsedTime) / duration;
    }

    /**
     * @dev Stake tokens for rewards and voting power
     * @param amount Amount to stake
     * @param lockPeriod Lock period in seconds (longer = better rewards)
     */
    function stakeTokens(uint256 amount, uint256 lockPeriod) public nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(lockPeriod >= 7 days, "Minimum lock period is 7 days");
        require(lockPeriod <= 365 days, "Maximum lock period is 365 days");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        // Calculate reward rate based on lock period
        uint256 rewardRate = calculateRewardRate(lockPeriod);
        
        // Transfer tokens to contract
        _transfer(msg.sender, address(this), amount);
        
        // Create stake
        userStakes[msg.sender].push(StakeInfo({
            amount: amount,
            startTime: block.timestamp,
            lockPeriod: lockPeriod,
            rewardRate: rewardRate
        }));
        
        totalStaked[msg.sender] += amount;
        totalStakedSupply += amount;
        
        // Update voting power
        _updateVotingPower(msg.sender);
        
        emit TokensStaked(msg.sender, amount, lockPeriod);
    }

    /**
     * @dev Unstake tokens and claim rewards
     * @param stakeIndex Index of the stake to unstake
     */
    function unstakeTokens(uint256 stakeIndex) public nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Invalid stake index");
        
        StakeInfo storage stake = userStakes[msg.sender][stakeIndex];
        require(stake.amount > 0, "Stake already withdrawn");
        require(
            block.timestamp >= stake.startTime + stake.lockPeriod,
            "Stake still locked"
        );
        
        uint256 stakedAmount = stake.amount;
        uint256 reward = calculateStakeReward(msg.sender, stakeIndex);
        
        // Update state
        stake.amount = 0;
        totalStaked[msg.sender] -= stakedAmount;
        totalStakedSupply -= stakedAmount;
        
        // Transfer staked tokens back
        _transfer(address(this), msg.sender, stakedAmount);
        
        // Mint and transfer rewards
        if (reward > 0 && totalSupply() + reward <= MAX_SUPPLY) {
            _mint(msg.sender, reward);
        }
        
        // Update voting power
        _updateVotingPower(msg.sender);
        
        emit TokensUnstaked(msg.sender, stakedAmount, reward);
    }

    /**
     * @dev Calculate reward rate based on lock period
     * @param lockPeriod Lock period in seconds
     * @return Reward rate in basis points (annual)
     */
    function calculateRewardRate(uint256 lockPeriod) public pure returns (uint256) {
        if (lockPeriod >= 365 days) return 2000; // 20% APY
        if (lockPeriod >= 180 days) return 1500; // 15% APY
        if (lockPeriod >= 90 days) return 1000; // 10% APY
        if (lockPeriod >= 30 days) return 500; // 5% APY
        return 200; // 2% APY
    }

    /**
     * @dev Calculate stake reward for a specific stake
     * @param user User address
     * @param stakeIndex Stake index
     * @return Calculated reward amount
     */
    function calculateStakeReward(address user, uint256 stakeIndex) 
        public view returns (uint256) {
        require(stakeIndex < userStakes[user].length, "Invalid stake index");
        
        StakeInfo storage stake = userStakes[user][stakeIndex];
        if (stake.amount == 0) return 0;
        
        uint256 stakeDuration = block.timestamp - stake.startTime;
        uint256 annualReward = (stake.amount * stake.rewardRate) / 10000;
        
        return (annualReward * stakeDuration) / 365 days;
    }

    /**
     * @dev Distribute rewards to users for various activities
     * @param recipient Recipient address
     * @param amount Reward amount
     * @param reason Reason for reward
     */
    function distributeRewards(
        address recipient,
        uint256 amount,
        string memory reason
    ) public onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be positive");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        rewardBalances[recipient] += amount;
        _mint(recipient, amount);
        
        emit RewardsDistributed(recipient, amount, reason);
    }

    /**
     * @dev Mint tokens for ecosystem growth (limited)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mintForEcosystem(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        _mint(to, amount);
    }

    /**
     * @dev Update voting power based on staked tokens
     * @param user User address
     */
    function _updateVotingPower(address user) internal {
        uint256 balance = balanceOf(user);
        uint256 staked = totalStaked[user];
        
        // Voting power = balance + 2x staked tokens
        uint256 newVotingPower = balance + (staked * 2);
        votingPower[user] = newVotingPower;
        
        emit VotingPowerUpdated(user, newVotingPower);
    }

    /**
     * @dev Get user's total staking information
     * @param user User address
     * @return stakes Array of user's stakes
     * @return totalAmount Total staked amount
     * @return totalRewards Total pending rewards
     */
    function getUserStakingInfo(address user) 
        public view returns (
            StakeInfo[] memory stakes,
            uint256 totalAmount,
            uint256 totalRewards
        ) {
        stakes = userStakes[user];
        totalAmount = totalStaked[user];
        
        // Calculate total pending rewards
        for (uint256 i = 0; i < stakes.length; i++) {
            if (stakes[i].amount > 0) {
                totalRewards += calculateStakeReward(user, i);
            }
        }
        
        return (stakes, totalAmount, totalRewards);
    }

    /**
     * @dev Emergency pause (only owner)
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause (only owner)
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Override _beforeTokenTransfer to handle pausing
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
        
        // Update voting power for both sender and receiver
        if (from != address(0) && from != address(this)) {
            _updateVotingPower(from);
        }
        if (to != address(0) && to != address(this)) {
            _updateVotingPower(to);
        }
    }

    /**
     * @dev Get token economics overview
     */
    function getTokenomics() public view returns (
        uint256 currentSupply,
        uint256 maxSupply,
        uint256 circulatingSupply,
        uint256 stakedSupply,
        uint256 burnedSupply
    ) {
        currentSupply = totalSupply();
        maxSupply = MAX_SUPPLY;
        circulatingSupply = currentSupply - balanceOf(address(this));
        stakedSupply = totalStakedSupply;
        burnedSupply = MAX_SUPPLY - currentSupply;
        
        return (currentSupply, maxSupply, circulatingSupply, stakedSupply, burnedSupply);
    }
}