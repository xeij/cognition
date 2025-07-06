# Cognition - Knowledge Discovery Mobile App

🧠 **Discover • Learn • Grow**

A cross-platform mobile application that delivers personalized, bite-sized interesting facts and knowledge, designed to maximize learning and user engagement through intelligent content recommendations.

## 📖 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Development](#development)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Best Practices](#best-practices)
- [Contributing](#contributing)
- [License](#license)

## 🌟 Overview

Cognition is a TikTok-style mobile app for knowledge discovery, delivering interesting facts across various categories including history, science, nature, technology, culture, and art. The app features a sophisticated recommendation algorithm that personalizes content based on user interactions and preferences.

### Key Objectives

- **Maximize Learning**: Deliver high-quality, interesting facts in digestible formats
- **Personalization**: Use machine learning to tailor content to user preferences
- **Engagement**: Create an addictive, social media-like experience for education
- **Accessibility**: Ensure content is available across difficulty levels
- **Scalability**: Built to handle millions of users and facts

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│   Mobile App    │◄──►│   Backend API   │◄──►│  AWS DynamoDB   │
│ (React Native)  │    │   (Node.js)     │    │   (Database)    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │                 │
                       │ Wikipedia API   │
                       │   (Content)     │
                       │                 │
                       └─────────────────┘
```

### Component Architecture

#### Mobile App (React Native + Expo)
- **Context API**: Global state management for facts, user data, and preferences
- **Infinite Scroll**: TikTok-style vertical scrolling with pagination
- **Offline Support**: AsyncStorage for caching user data and preferences
- **Cross-Platform**: Single codebase for iOS and Android

#### Backend API (Node.js + Express)
- **RESTful API**: Comprehensive endpoints for facts, users, interactions, and recommendations
- **Recommendation Engine**: Collaborative filtering algorithm for personalized content
- **Rate Limiting**: Prevents abuse and ensures fair usage
- **Error Handling**: Comprehensive error management and logging

#### Database (AWS DynamoDB)
- **Facts Table**: Stores all fact content with metadata
- **Users Table**: User profiles and preferences
- **Interactions Table**: User engagement tracking (likes, shares, reads)
- **Categories Table**: Content categorization

#### Content Pipeline (Python)
- **Wikipedia Scraper**: Automated fact extraction from Wikipedia
- **Content Processing**: NLP-based quality filtering and categorization
- **Batch Processing**: Efficient data pipeline for content updates

## ✨ Features

### User Features
- **Infinite Scroll Feed**: Endless discovery of interesting facts
- **Personalized Recommendations**: AI-powered content curation
- **Dark Theme**: Optimized for reading and battery life
- **Social Interactions**: Like, share, and save favorite facts
- **Reading Progress**: Track reading streaks and statistics
- **Category Preferences**: Customize content by interests
- **Difficulty Levels**: Content for all knowledge levels
- **Offline Reading**: Access previously loaded content offline

### Technical Features
- **Real-time Analytics**: User interaction tracking
- **A/B Testing Ready**: Framework for testing recommendation algorithms
- **Scalable Architecture**: Designed for millions of users
- **CDN Integration**: Fast content delivery worldwide
- **Security**: Rate limiting, input validation, and secure API design
- **Monitoring**: Comprehensive logging and error tracking

## 🛠️ Tech Stack

### Frontend
- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and tools
- **TypeScript**: Type-safe JavaScript
- **React Navigation**: Navigation library
- **Axios**: HTTP client for API calls
- **AsyncStorage**: Local data persistence

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web application framework
- **AWS SDK**: Cloud services integration
- **Winston**: Logging library
- **Jest**: Testing framework
- **Joi**: Data validation

### Database & Cloud
- **AWS DynamoDB**: NoSQL database
- **AWS Lambda**: Serverless functions (future)
- **AWS CloudFront**: Content delivery network
- **AWS S3**: File storage (future)

### Content Processing
- **Python**: Scripting and data processing
- **Wikipedia API**: Content source
- **NLTK**: Natural language processing
- **BeautifulSoup**: Web scraping
- **Pandas**: Data manipulation

### DevOps & Tools
- **Git**: Version control
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Docker**: Containerization (future)
- **GitHub Actions**: CI/CD (future)

## 📁 Project Structure

```
cognition/
├── mobile-app/                 # React Native mobile application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── screens/           # Screen components
│   │   ├── context/           # Global state management
│   │   ├── services/          # API and external services
│   │   └── utils/             # Utility functions
│   ├── package.json
│   └── app.json               # Expo configuration
│
├── backend/                   # Node.js backend API
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   ├── middleware/       # Express middleware
│   │   ├── config/          # Configuration files
│   │   ├── utils/           # Utility functions
│   │   └── index.js         # Main server file
│   ├── package.json
│   └── env.example          # Environment variables template
│
├── scripts/                  # Python scripts and utilities
│   ├── wikipedia_scraper.py  # Main content scraping script
│   ├── requirements.txt      # Python dependencies
│   └── env.example          # Environment variables template
│
├── infrastructure/           # AWS infrastructure as code (future)
│   ├── terraform/           # Terraform configurations
│   └── cloudformation/      # CloudFormation templates
│
├── docs/                    # Additional documentation
│   ├── api.md              # API documentation
│   ├── deployment.md       # Deployment guide
│   └── architecture.md     # Detailed architecture docs
│
├── .gitignore              # Git ignore patterns
└── README.md               # Main documentation
```

## 🚀 Setup & Installation

### Prerequisites

- **Node.js** (v18+)
- **Python** (v3.8+)
- **AWS Account** with DynamoDB access
- **Expo CLI** for mobile development
- **Git** for version control

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/cognition.git
   cd cognition
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp env.example .env
   # Edit .env with your AWS credentials and configuration
   npm run dev
   ```

3. **Mobile App Setup**
   ```bash
   cd mobile-app
   npm install
   expo start
   ```

4. **Python Scripts Setup**
   ```bash
   cd scripts
   pip install -r requirements.txt
   cp env.example .env
   # Edit .env with your AWS credentials
   python wikipedia_scraper.py --test
   ```

### AWS Configuration

1. **Create DynamoDB Tables**
   - The backend will automatically create tables on first run
   - Or use the AWS Console to create tables manually

2. **Configure IAM Permissions**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:GetItem",
           "dynamodb:PutItem",
           "dynamodb:Query",
           "dynamodb:Scan",
           "dynamodb:UpdateItem",
           "dynamodb:DeleteItem",
           "dynamodb:BatchGetItem",
           "dynamodb:BatchWriteItem"
         ],
         "Resource": [
           "arn:aws:dynamodb:region:account:table/cognition-*"
         ]
       }
     ]
   }
   ```

## 💻 Development

### Running the Application

1. **Start Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Mobile App**
   ```bash
   cd mobile-app
   expo start
   ```

3. **Run Content Scraper**
   ```bash
   cd scripts
   python wikipedia_scraper.py --categories science history --max-articles 5
   ```

### Development Workflow

1. **Feature Development**
   - Create feature branch from `main`
   - Implement feature with tests
   - Submit pull request for review

2. **Code Quality**
   - Run ESLint: `npm run lint`
   - Run tests: `npm test`
   - Format code: `npm run format`

3. **Content Management**
   - Use scraper to populate initial content
   - Monitor content quality and user engagement
   - Update categories and topics based on analytics

### Testing

```bash
# Backend tests
cd backend
npm test

# Mobile app tests
cd mobile-app
npm test

# Python script tests
cd scripts
python -m pytest tests/
```

## 🌐 Deployment

### Backend Deployment (AWS)

1. **Prepare for deployment**
   ```bash
   cd backend
   npm run build
   ```

2. **Deploy to AWS Lambda** (recommended)
   - Use Serverless Framework or AWS SAM
   - Configure API Gateway for routing
   - Set up CloudWatch for monitoring

3. **Deploy to EC2** (alternative)
   - Use PM2 for process management
   - Configure NGINX as reverse proxy
   - Set up SSL certificates

### Mobile App Deployment

1. **Build for iOS**
   ```bash
   cd mobile-app
   expo build:ios
   ```

2. **Build for Android**
   ```bash
   cd mobile-app
   expo build:android
   ```

3. **App Store Submission**
   - Use Expo's build service
   - Submit to Apple App Store and Google Play Store

### Infrastructure as Code

```bash
# Deploy AWS infrastructure
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

## 📚 API Documentation

### Authentication
Currently using simple user ID-based authentication. JWT implementation planned for production.

### Core Endpoints

#### Facts
- `GET /api/facts` - Get paginated facts with filtering
- `GET /api/facts/:id` - Get specific fact
- `POST /api/facts` - Create new fact (admin)
- `GET /api/facts/trending/all` - Get trending facts

#### Users
- `GET /api/users/:id` - Get user profile
- `POST /api/users` - Create/update user
- `PUT /api/users/:id/preferences` - Update user preferences

#### Interactions
- `POST /api/interactions` - Record user interaction
- `GET /api/interactions/user/:userId` - Get user interactions
- `GET /api/interactions/stats/:factId` - Get fact statistics

#### Recommendations
- `GET /api/recommendations/:userId` - Get personalized recommendations
- `GET /api/recommendations/similar/:factId` - Get similar facts

#### Search & Categories
- `GET /api/search` - Search facts by query
- `GET /api/categories` - Get available categories

### Request/Response Examples

**Get Facts**
```bash
curl "http://localhost:3000/api/facts?limit=10&category=science&difficulty=intermediate"
```

**Record Interaction**
```bash
curl -X POST "http://localhost:3000/api/interactions" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","factId":"fact456","type":"like"}'
```

## 🏆 Best Practices

### Code Quality
- **TypeScript**: Use strict typing for better code quality
- **ESLint/Prettier**: Consistent code formatting and linting
- **Component Structure**: Keep components small and focused
- **Error Handling**: Comprehensive error boundaries and logging

### Performance
- **Pagination**: Implement efficient pagination for large datasets
- **Caching**: Use caching strategies for frequently accessed data
- **Image Optimization**: Optimize images and use CDN
- **Bundle Size**: Monitor and optimize app bundle size

### User Experience
- **Loading States**: Show appropriate loading indicators
- **Error Messages**: User-friendly error messages
- **Offline Support**: Graceful offline functionality
- **Accessibility**: Follow accessibility guidelines

### Security
- **Input Validation**: Validate all user inputs
- **Rate Limiting**: Prevent API abuse
- **Data Privacy**: Respect user privacy and data protection laws
- **Secure Storage**: Use secure storage for sensitive data

### Scalability
- **Database Design**: Optimize database schema for read performance
- **Microservices**: Consider microservices for large-scale deployment
- **CDN**: Use CDN for global content delivery
- **Monitoring**: Implement comprehensive monitoring and alerting

## 📊 Analytics & Monitoring

### Key Metrics
- **User Engagement**: Reading time, scroll depth, interaction rates
- **Content Performance**: Fact popularity, category preferences
- **Technical Metrics**: API response times, error rates
- **Business Metrics**: User retention, session length

### Monitoring Tools
- **CloudWatch**: AWS native monitoring
- **Analytics**: User behavior tracking
- **Error Tracking**: Real-time error monitoring
- **Performance Monitoring**: API and app performance

## 🔄 Content Management

### Content Strategy
- **Quality First**: Focus on interesting, accurate facts
- **Diversity**: Cover multiple categories and difficulty levels
- **Freshness**: Regular content updates and new categories
- **User-Generated**: Future support for user-submitted content

### Content Pipeline
1. **Automated Scraping**: Wikipedia and other sources
2. **Quality Filtering**: NLP-based quality assessment
3. **Manual Review**: Human oversight for quality assurance
4. **Publishing**: Automated deployment to production

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines:

1. **Fork** the repository
2. **Create** a feature branch
3. **Commit** your changes with clear messages
4. **Test** your changes thoroughly
5. **Submit** a pull request with description

### Development Guidelines
- Follow existing code style and patterns
- Add tests for new features
- Update documentation as needed
- Use meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Wikipedia**: Primary content source
- **React Native Community**: Framework and tools
- **AWS**: Cloud infrastructure
- **Open Source Contributors**: Various libraries and tools

## 📞 Support

For support and questions:
- **GitHub Issues**: Technical issues and feature requests
- **Documentation**: Comprehensive docs in `/docs` directory
- **Community**: Join our community discussions

---

**Built with ❤️ for knowledge seekers everywhere**

---

*Cognition - Transforming how we discover and learn interesting facts about our world.* 