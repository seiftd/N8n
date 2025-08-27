// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title SbaroWorkflowNFT
 * @dev NFT contract for representing workflows as unique digital assets
 * Enables ownership, trading, and royalties for workflow creators
 */
contract SbaroWorkflowNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    struct WorkflowMetadata {
        string name;
        string description;
        string category;
        address creator;
        uint256 createdAt;
        uint256 executionCount;
        uint256 revenue;
        bool isPublic;
        uint96 royaltyPercentage; // In basis points (100 = 1%)
    }

    struct WorkflowExecution {
        uint256 tokenId;
        address executor;
        uint256 timestamp;
        bool success;
        uint256 gasUsed;
        bytes32 dataHash;
    }

    mapping(uint256 => WorkflowMetadata) public workflowMetadata;
    mapping(uint256 => WorkflowExecution[]) public workflowExecutions;
    mapping(address => uint256[]) public creatorWorkflows;
    mapping(uint256 => uint256) public workflowPrices;
    mapping(uint256 => bool) public workflowForSale;
    
    // Royalty support (EIP-2981)
    mapping(uint256 => address) private _royaltyRecipients;
    mapping(uint256 => uint96) private _royaltyPercentages;

    event WorkflowMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string name,
        string ipfsHash
    );
    
    event WorkflowExecuted(
        uint256 indexed tokenId,
        address indexed executor,
        bool success,
        uint256 gasUsed
    );
    
    event WorkflowSale(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );
    
    event RoyaltyPaid(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 amount
    );

    constructor() ERC721("Sbaro Workflow NFT", "SBWF") {}

    /**
     * @dev Mint a new workflow NFT
     * @param to Address to mint the NFT to
     * @param name Workflow name
     * @param description Workflow description
     * @param category Workflow category
     * @param ipfsHash IPFS hash containing workflow definition
     * @param royaltyPercentage Royalty percentage in basis points
     */
    function mintWorkflow(
        address to,
        string memory name,
        string memory description,
        string memory category,
        string memory ipfsHash,
        uint96 royaltyPercentage
    ) public returns (uint256) {
        require(royaltyPercentage <= 1000, "Royalty too high"); // Max 10%
        
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, ipfsHash);

        workflowMetadata[tokenId] = WorkflowMetadata({
            name: name,
            description: description,
            category: category,
            creator: to,
            createdAt: block.timestamp,
            executionCount: 0,
            revenue: 0,
            isPublic: false,
            royaltyPercentage: royaltyPercentage
        });

        creatorWorkflows[to].push(tokenId);
        
        // Set royalty info
        _royaltyRecipients[tokenId] = to;
        _royaltyPercentages[tokenId] = royaltyPercentage;

        emit WorkflowMinted(tokenId, to, name, ipfsHash);
        
        return tokenId;
    }

    /**
     * @dev Execute a workflow and record the execution
     * @param tokenId The workflow token ID
     * @param dataHash Hash of execution data
     * @param success Whether execution was successful
     * @param gasUsed Gas used for execution
     */
    function executeWorkflow(
        uint256 tokenId,
        bytes32 dataHash,
        bool success,
        uint256 gasUsed
    ) public {
        require(_exists(tokenId), "Workflow does not exist");
        
        WorkflowExecution memory execution = WorkflowExecution({
            tokenId: tokenId,
            executor: msg.sender,
            timestamp: block.timestamp,
            success: success,
            gasUsed: gasUsed,
            dataHash: dataHash
        });

        workflowExecutions[tokenId].push(execution);
        workflowMetadata[tokenId].executionCount++;

        emit WorkflowExecuted(tokenId, msg.sender, success, gasUsed);
    }

    /**
     * @dev List workflow for sale
     * @param tokenId The workflow token ID
     * @param price Sale price in wei
     */
    function listForSale(uint256 tokenId, uint256 price) public {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(price > 0, "Price must be greater than 0");
        
        workflowForSale[tokenId] = true;
        workflowPrices[tokenId] = price;
    }

    /**
     * @dev Remove workflow from sale
     * @param tokenId The workflow token ID
     */
    function removeFromSale(uint256 tokenId) public {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        
        workflowForSale[tokenId] = false;
        workflowPrices[tokenId] = 0;
    }

    /**
     * @dev Purchase a workflow NFT
     * @param tokenId The workflow token ID
     */
    function purchaseWorkflow(uint256 tokenId) public payable nonReentrant {
        require(_exists(tokenId), "Workflow does not exist");
        require(workflowForSale[tokenId], "Workflow not for sale");
        require(msg.value >= workflowPrices[tokenId], "Insufficient payment");

        address seller = ownerOf(tokenId);
        uint256 price = workflowPrices[tokenId];
        
        // Calculate royalty for original creator
        address creator = workflowMetadata[tokenId].creator;
        uint256 royaltyAmount = 0;
        
        if (creator != seller && _royaltyPercentages[tokenId] > 0) {
            royaltyAmount = (price * _royaltyPercentages[tokenId]) / 10000;
            payable(creator).transfer(royaltyAmount);
            emit RoyaltyPaid(tokenId, creator, royaltyAmount);
        }

        // Transfer remaining amount to seller
        uint256 sellerAmount = price - royaltyAmount;
        payable(seller).transfer(sellerAmount);

        // Transfer NFT to buyer
        _transfer(seller, msg.sender, tokenId);

        // Remove from sale
        workflowForSale[tokenId] = false;
        workflowPrices[tokenId] = 0;

        // Update revenue
        workflowMetadata[tokenId].revenue += price;

        emit WorkflowSale(tokenId, seller, msg.sender, price);

        // Refund excess payment
        if (msg.value > price) {
            payable(msg.sender).transfer(msg.value - price);
        }
    }

    /**
     * @dev Make workflow public or private
     * @param tokenId The workflow token ID
     * @param isPublic Whether workflow should be public
     */
    function setWorkflowVisibility(uint256 tokenId, bool isPublic) public {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        workflowMetadata[tokenId].isPublic = isPublic;
    }

    /**
     * @dev Get workflow execution history
     * @param tokenId The workflow token ID
     * @return Array of workflow executions
     */
    function getWorkflowExecutions(uint256 tokenId) 
        public view returns (WorkflowExecution[] memory) {
        return workflowExecutions[tokenId];
    }

    /**
     * @dev Get workflows created by address
     * @param creator Creator address
     * @return Array of token IDs
     */
    function getCreatorWorkflows(address creator) 
        public view returns (uint256[] memory) {
        return creatorWorkflows[creator];
    }

    /**
     * @dev Get workflows for sale
     * @return Arrays of token IDs and prices
     */
    function getWorkflowsForSale() 
        public view returns (uint256[] memory tokenIds, uint256[] memory prices) {
        uint256 count = 0;
        uint256 totalSupply = _tokenIdCounter.current();
        
        // Count workflows for sale
        for (uint256 i = 0; i < totalSupply; i++) {
            if (_exists(i) && workflowForSale[i]) {
                count++;
            }
        }
        
        tokenIds = new uint256[](count);
        prices = new uint256[](count);
        
        uint256 index = 0;
        for (uint256 i = 0; i < totalSupply; i++) {
            if (_exists(i) && workflowForSale[i]) {
                tokenIds[index] = i;
                prices[index] = workflowPrices[i];
                index++;
            }
        }
        
        return (tokenIds, prices);
    }

    /**
     * @dev EIP-2981 royalty info
     */
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external view returns (address receiver, uint256 royaltyAmount) {
        require(_exists(tokenId), "Token does not exist");
        
        receiver = _royaltyRecipients[tokenId];
        royaltyAmount = (salePrice * _royaltyPercentages[tokenId]) / 10000;
        
        return (receiver, royaltyAmount);
    }

    /**
     * @dev Check if contract supports interface
     */
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage) returns (bool) {
        return interfaceId == 0x2a55205a || // EIP-2981
               super.supportsInterface(interfaceId);
    }

    // Override functions for URI storage
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
}