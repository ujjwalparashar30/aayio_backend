📖 Questions API Documentation
This document describes the available routes for managing Questions, including retrieving all questions, fetching question details, getting price history for charting, and viewing the order book for P2P trading.

📌 Base URL
/api/questions


🔐 Authentication
All endpoints support optional Bearer token authentication:

Authorization: Bearer <your_token>

📑 Routes
📍 GET /api/questions
Description:
Fetches a paginated list of questions with optional filters and sorting.

Query Parameters:
Parameter   	Type	        Description	Default
page	        string	        Page number for pagination	1
limit	        string	        Number of records per page	10
category	    string	        ilter by question category	undefined
status	        string	        Filter by question status (DRAFT, ACTIVE, PAUSED, RESOLVED, CANCELLED)	ACTIVE
search	        string	        Search term for title or description	undefined
sortBy	        string	        Field to sort by (e.g., createdAt)	createdAt
sortOrder	    string	        Sort order (asc or desc)	desc

Example Request:
GET /api/questions?page=2&limit=5&status=ACTIVE&sortBy=createdAt&sortOrder=asc

Success Response (200 OK):
{
  "success": true,
  "data": {
    "questions": [
      {
        "id": "clxxxxx",
        "title": "Will Bitcoin reach $100,000 by end of 2025?",
        "description": "This market will resolve to YES if Bitcoin (BTC) reaches or exceeds $100,000 USD on any major exchange by December 31, 2025.",
        "category": "crypto",
        "imageUrl": "https://example.com/bitcoin-image.jpg",
        "resolutionDate": "2025-12-31T23:59:59.000Z",
        "isResolved": false,
        "resolvedAnswer": null,
        "constantValue": 10000,
        "totalYesTokens": 8000,
        "totalNoTokens": 5000,
        "currentYesPrice": 1.25,
        "currentNoPrice": 2.00,
        "status": "ACTIVE",
        "creator": {
          "id": "admin_id",
          "firstName": "Admin",
          "lastName": "User"
        },
        "yesToken": {
          "currentPrice": 1.25,
          "circulatingSupply": 8000,
          "totalVolume": 8000
        },
        "noToken": {
          "currentPrice": 2.00,
          "circulatingSupply": 5000,
          "totalVolume": 8000
        },
        "_count": {
          "yesTokenHoldings": 1,
          "noTokenHoldings": 1
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}

📍 GET /api/questions/:id
Description:
Fetches a specific question by its ID with full details and market stats.

URL Params:
Parameter	Type	    Description
id	        string	    ID of the question

Example Request:
GET /api/questions/clxxxxx_bitcoin_question_id

Success Response (200 OK):
{
  "success": true,
  "data": {
    "question": {
      "id": "clxxxxx",
      "title": "Will Bitcoin reach $100,000 by end of 2025?",
      "description": "This market will resolve to YES if Bitcoin (BTC) reaches or exceeds $100,000 USD on any major exchange by December 31, 2025.",
      "category": "crypto",
      "imageUrl": "https://example.com/bitcoin-image.jpg",
      "resolutionDate": "2025-12-31T23:59:59.000Z",
      "isResolved": false,
      "resolvedAnswer": null,
      "constantValue": 10000,
      "totalYesTokens": 8000,
      "totalNoTokens": 5000,
      "currentYesPrice": 1.25,
      "currentNoPrice": 2.00,
      "status": "ACTIVE",
      "creator": {
        "id": "admin_id",
        "firstName": "Admin",
        "lastName": "User"
      },
      "yesToken": {
        "currentPrice": 1.25,
        "availableSupply": 2000,
        "circulatingSupply": 8000,
        "totalVolume": 8000
      },
      "noToken": {
        "currentPrice": 2.00,
        "availableSupply": 5000,
        "circulatingSupply": 5000,
        "totalVolume": 8000
      },
      "yesTokenHoldings": [
        {
          "quantity": 500,
          "averageBuyPrice": 1.20,
          "user": {
            "id": "user_test_123",
            "firstName": null,
            "lastName": null
          }
        }
      ],
      "noTokenHoldings": [
        {
          "quantity": 300,
          "averageBuyPrice": 1.90,
          "user": {
            "id": "user_test_123",
            "firstName": null,
            "lastName": null
          }
        }
      ],
      "marketResolution": null
    },
    "marketStats": {
      "totalParticipants": 2,
      "totalVolume": 16000,
      "yesHolders": 1,
      "noHolders": 1,
      "totalYesTokens": 8000,
      "totalNoTokens": 5000,
      "yesPercentage": "61.54",
      "noPercentage": "38.46"
    }
  }
}

Error Response (404 Not Found):
{
  "success": false,
  "error": "Question not found"
}

📍 GET /api/questions/:id/price-history
Description:
Fetches the price history for a given question, for charting or analytics purposes.

URL Params:

Parameter	    Type	    Description
id	            string	    ID of the question

Query Parameters:

Parameter	    Type	    Description	                            Default
timeframe	    string	    Time range (1h, 1d, 7d, 30d)	        7d
interval	    string	    Interval for grouping (minutes/hours)	1h

Example Request:
GET /api/questions/clxxxxx_bitcoin_question_id/price-history?timeframe=7d&interval=1h

Success Response (200 OK):
{
  "success": true,
  "data": {
    "priceHistory": [
      {
        "timestamp": "2025-07-10T13:41:00.000Z",
        "yesPrice": 1.20,
        "noPrice": 1.90
      },
      {
        "timestamp": "2025-07-11T13:41:00.000Z",
        "yesPrice": 1.25,
        "noPrice": 1.85
      },
      {
        "timestamp": "2025-07-12T13:41:00.000Z",
        "yesPrice": 1.25,
        "noPrice": 1.90
      }
    ],
    "timeframe": "7d",
    "interval": "1h"
  }
}

📍 GET /api/questions/:id/order-book
Description:
Fetches the P2P order book (pending buy/sell orders) for a specific question.

URL Params:

Parameter	    Type	    Description
id	            string	    ID of the question

Example Request:
GET /api/questions/clxxxxx_bitcoin_question_id/order-book

Success Response (200 OK):
{
  "success": true,
  "data": {
    "yesOrders": {
      "buys": [],
      "sells": [
        {
          "id": "order_id",
          "userId": "user_test_123",
          "userName": "John Doe",
          "quantity": 100,
          "pricePerToken": 1.30,
          "totalAmount": 130,
          "createdAt": "2025-07-13T08:11:00.000Z",
          "expiresAt": "2025-07-20T08:11:00.000Z"
        }
      ]
    },
    "noOrders": {
      "buys": [
        {
          "id": "order_id_2",
          "userId": "user_test_123",
          "userName": "Jane Smith",
          "quantity": 50,
          "pricePerToken": 1.95,
          "totalAmount": 97.50,
          "createdAt": "2025-07-13T08:11:00.000Z",
          "expiresAt": "2025-07-16T08:11:00.000Z"
        }
      ],
      "sells": []
    }
  }
}

All error responses will have:
success: false
A descriptive error message

📝 Author
Built by Ujjwal Parashar
Contact: whomtalkto@gmail.com


