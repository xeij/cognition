#!/usr/bin/env python3
import os
import sys
import time
import json
import uuid
import argparse
import logging
import re
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

import requests
import wikipedia
import boto3
from bs4 import BeautifulSoup
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import nltk
import textstat
from langdetect import detect, LangDetectError
from tqdm import tqdm

# Load environment variables
load_dotenv()

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('wikipedia_scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class Fact:
    """Data class for storing fact information"""
    title: str
    content: str
    category: str
    tags: List[str]
    difficulty: str
    reading_time: int
    source: str
    source_url: str
    popularity: int = 0

class WikipediaScraper:
    """Main Wikipedia scraping class"""
    
    def __init__(self):
        self.setup_aws()
        self.setup_categories()
        self.facts_processed = 0
        self.facts_saved = 0
        
    def setup_aws(self):
        """Initialize AWS DynamoDB connection"""
        try:
            self.dynamodb = boto3.resource(
                'dynamodb',
                region_name=os.getenv('AWS_REGION', 'us-east-1'),
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
            )
            
            self.facts_table = self.dynamodb.Table(
                os.getenv('FACTS_TABLE_NAME', 'cognition-facts')
            )
            
            logger.info("AWS DynamoDB connection established")
            
        except Exception as e:
            logger.error(f"Failed to setup AWS connection: {e}")
            sys.exit(1)
    
    def setup_categories(self):
        """Define categories and their associated Wikipedia topics"""
        self.categories = {
            'history': {
                'topics': [
                    'Ancient history', 'World War II', 'Renaissance', 'Roman Empire',
                    'Ancient Egypt', 'Medieval history', 'Industrial Revolution',
                    'Cold War', 'American Civil War', 'French Revolution',
                    'Ancient Greece', 'Byzantine Empire', 'Ming Dynasty',
                    'Ottoman Empire', 'Spanish Inquisition', 'Age of Exploration'
                ],
                'keywords': ['war', 'empire', 'civilization', 'ancient', 'medieval', 'revolution']
            },
            'science': {
                'topics': [
                    'Quantum physics', 'DNA', 'Evolution', 'Solar system',
                    'Periodic table', 'Photosynthesis', 'Gravity', 'Relativity',
                    'Genetics', 'Astronomy', 'Chemistry', 'Biology',
                    'Neuroscience', 'Climate change', 'Ecology', 'Mathematics'
                ],
                'keywords': ['theory', 'discovery', 'research', 'experiment', 'scientific']
            },
            'nature': {
                'topics': [
                    'Amazon rainforest', 'Ocean', 'Biodiversity', 'Ecosystem',
                    'Wildlife', 'Marine biology', 'Botany', 'Zoology',
                    'National parks', 'Conservation', 'Endangered species',
                    'Coral reef', 'Desert', 'Mountain', 'Forest', 'River'
                ],
                'keywords': ['animal', 'plant', 'species', 'habitat', 'conservation']
            },
            'technology': {
                'topics': [
                    'Internet', 'Artificial intelligence', 'Computer science',
                    'Space exploration', 'Robotics', 'Biotechnology',
                    'Nanotechnology', 'Renewable energy', 'Electric vehicle',
                    'Blockchain', 'Virtual reality', 'Machine learning',
                    'Quantum computing', 'Cybersecurity', 'Smartphone'
                ],
                'keywords': ['innovation', 'digital', 'computer', 'technology', 'invention']
            },
            'culture': {
                'topics': [
                    'Literature', 'Music', 'Art', 'Philosophy', 'Religion',
                    'Language', 'Anthropology', 'Sociology', 'Psychology',
                    'Mythology', 'Folklore', 'Tradition', 'Festival',
                    'Architecture', 'Cuisine', 'Fashion'
                ],
                'keywords': ['cultural', 'traditional', 'artistic', 'social', 'cultural']
            },
            'art': {
                'topics': [
                    'Painting', 'Sculpture', 'Renaissance art', 'Modern art',
                    'Photography', 'Cinema', 'Theater', 'Dance',
                    'Leonardo da Vinci', 'Vincent van Gogh', 'Pablo Picasso',
                    'Michelangelo', 'Salvador Dalí', 'Impressionism',
                    'Abstract art', 'Street art'
                ],
                'keywords': ['artistic', 'creative', 'aesthetic', 'visual', 'cultural']
            }
        }
        
        # Set Wikipedia language
        wikipedia.set_lang("en")
        
    def get_wikipedia_articles(self, category: str, max_articles: int = 10) -> List[str]:
        """Get Wikipedia article titles for a given category"""
        articles = []
        category_data = self.categories.get(category, {})
        topics = category_data.get('topics', [])
        
        for topic in topics[:max_articles]:
            try:
                # Search for articles related to the topic
                search_results = wikipedia.search(topic, results=3)
                
                for result in search_results:
                    if result not in articles and len(articles) < max_articles:
                        articles.append(result)
                        
                # Add some delay to respect rate limits
                time.sleep(0.5)
                
            except Exception as e:
                logger.warning(f"Error searching for topic '{topic}': {e}")
                continue
                
        return articles[:max_articles]
    
    def extract_facts_from_article(self, article_title: str, category: str) -> List[Fact]:
        """Extract interesting facts from a Wikipedia article"""
        facts = []
        
        try:
            # Get the Wikipedia page
            page = wikipedia.page(article_title)
            content = page.content
            summary = page.summary
            
            # Split content into sentences
            sentences = nltk.sent_tokenize(content)
            
            # Filter for interesting sentences
            interesting_sentences = self.filter_interesting_sentences(
                sentences, category, article_title
            )
            
            # Create facts from interesting sentences
            for sentence_group in interesting_sentences:
                fact = self.create_fact_from_content(
                    sentence_group, category, article_title, page.url
                )
                if fact:
                    facts.append(fact)
                    
        except wikipedia.exceptions.DisambiguationError as e:
            # Try with the first option
            try:
                page = wikipedia.page(e.options[0])
                # Recursively call with the disambiguated title
                return self.extract_facts_from_article(e.options[0], category)
            except Exception:
                logger.warning(f"Could not resolve disambiguation for: {article_title}")
                
        except wikipedia.exceptions.PageError:
            logger.warning(f"Page not found: {article_title}")
            
        except Exception as e:
            logger.error(f"Error extracting facts from {article_title}: {e}")
            
        return facts
    
    def filter_interesting_sentences(self, sentences: List[str], category: str, title: str) -> List[str]:
        """Filter sentences to find the most interesting facts"""
        interesting = []
        category_keywords = self.categories.get(category, {}).get('keywords', [])
        
        for sentence in sentences:
            # Skip very short or very long sentences
            if len(sentence) < 50 or len(sentence) > 500:
                continue
                
            # Skip sentences with too many numbers (likely not interesting facts)
            if len(re.findall(r'\d+', sentence)) > 5:
                continue
                
            # Check for interesting patterns
            interesting_patterns = [
                r'first|oldest|largest|smallest|highest|deepest|fastest|slowest',
                r'discovered|invented|created|founded|established',
                r'unusual|unique|rare|extraordinary|remarkable|surprising',
                r'only|never|always|most|least',
                r'believed|thought|considered|known',
                r'can|ability|capable|able'
            ]
            
            # Check if sentence contains interesting patterns
            has_interesting_pattern = any(
                re.search(pattern, sentence, re.IGNORECASE) 
                for pattern in interesting_patterns
            )
            
            # Check for category relevance
            has_category_keyword = any(
                keyword in sentence.lower() 
                for keyword in category_keywords
            )
            
            # Calculate readability score
            readability_score = textstat.flesch_reading_ease(sentence)
            
            # Filter based on criteria
            if (has_interesting_pattern or has_category_keyword) and readability_score > 30:
                interesting.append(sentence.strip())
                
        return interesting[:5]  # Limit to top 5 interesting sentences per article
    
    def create_fact_from_content(self, content: str, category: str, 
                               source_title: str, source_url: str) -> Optional[Fact]:
        """Create a Fact object from content"""
        
        # Clean the content
        content = self.clean_content(content)
        
        if len(content) < 100 or len(content) > 2000:
            return None
            
        # Check language
        try:
            if detect(content) != 'en':
                return None
        except LangDetectError:
            return None
            
        # Generate title from content
        title = self.generate_title(content, source_title)
        
        # Extract tags
        tags = self.extract_tags(content, category)
        
        # Determine difficulty
        difficulty = self.determine_difficulty(content)
        
        # Calculate reading time
        reading_time = self.calculate_reading_time(content)
        
        # Initial popularity score
        popularity = self.calculate_initial_popularity(content, category)
        
        return Fact(
            title=title,
            content=content,
            category=category,
            tags=tags,
            difficulty=difficulty,
            reading_time=reading_time,
            source=f"Wikipedia - {source_title}",
            source_url=source_url,
            popularity=popularity
        )
    
    def clean_content(self, content: str) -> str:
        """Clean and format content"""
        # Remove extra whitespace
        content = re.sub(r'\s+', ' ', content)
        
        # Remove Wikipedia-specific elements
        content = re.sub(r'\[.*?\]', '', content)  # Remove citations
        content = re.sub(r'\(.*?\)', '', content)  # Remove parenthetical notes
        
        # Clean up common Wikipedia artifacts
        content = content.replace('==', '').replace('===', '')
        content = content.replace('Category:', '').replace('File:', '')
        
        return content.strip()
    
    def generate_title(self, content: str, source_title: str) -> str:
        """Generate an engaging title for the fact"""
        # Extract key phrases
        sentences = nltk.sent_tokenize(content)
        first_sentence = sentences[0] if sentences else content
        
        # Look for interesting openings
        interesting_starts = [
            r'(.*?) is the (first|oldest|largest|smallest|only)',
            r'(.*?) was (discovered|invented|created|founded)',
            r'(.*?) can (.*?)',
            r'The (.*?) is known for'
        ]
        
        for pattern in interesting_starts:
            match = re.search(pattern, first_sentence, re.IGNORECASE)
            if match:
                return match.group(0)[:100] + "..." if len(match.group(0)) > 100 else match.group(0)
        
        # Fallback: use source title with a descriptive phrase
        key_words = self.extract_key_words(content)
        if key_words:
            return f"{source_title}: {key_words[0]}"
        
        return source_title[:80] + "..." if len(source_title) > 80 else source_title
    
    def extract_tags(self, content: str, category: str) -> List[str]:
        """Extract relevant tags from content"""
        tags = [category]
        
        # Common interesting words/concepts
        tag_patterns = {
            'animals': r'\b(animal|species|wildlife|creature|mammal|bird|fish|reptile|insect)\b',
            'discovery': r'\b(discover|found|uncover|reveal|detect)\b',
            'ancient': r'\b(ancient|old|historical|prehistoric|millennium|century)\b',
            'science': r'\b(research|study|experiment|theory|scientific|discovery)\b',
            'unique': r'\b(unique|rare|unusual|extraordinary|remarkable|special)\b',
            'record': r'\b(largest|smallest|fastest|slowest|highest|deepest|first|last)\b',
            'mystery': r'\b(mystery|unknown|unexplained|puzzle|enigma)\b'
        }
        
        for tag, pattern in tag_patterns.items():
            if re.search(pattern, content, re.IGNORECASE):
                tags.append(tag)
        
        # Extract proper nouns (locations, names, etc.)
        proper_nouns = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', content)
        for noun in proper_nouns[:3]:  # Limit to 3 proper nouns
            if len(noun) > 3 and noun.lower() not in ['the', 'and', 'this', 'that']:
                tags.append(noun.lower())
        
        return list(set(tags))[:8]  # Limit to 8 tags
    
    def determine_difficulty(self, content: str) -> str:
        """Determine the difficulty level of the content"""
        # Use readability metrics
        flesch_score = textstat.flesch_reading_ease(content)
        grade_level = textstat.flesch_kincaid_grade(content)
        
        # Count complex words
        complex_words = textstat.difficult_words(content)
        total_words = len(content.split())
        complex_ratio = complex_words / total_words if total_words > 0 else 0
        
        # Determine difficulty based on multiple factors
        if flesch_score >= 70 and grade_level <= 8 and complex_ratio < 0.15:
            return 'beginner'
        elif flesch_score >= 50 and grade_level <= 12 and complex_ratio < 0.25:
            return 'intermediate'
        else:
            return 'advanced'
    
    def calculate_reading_time(self, content: str) -> int:
        """Calculate estimated reading time in minutes"""
        word_count = len(content.split())
        # Average reading speed: 200-250 words per minute
        reading_time = max(1, round(word_count / 225))
        return min(reading_time, 15)  # Cap at 15 minutes
    
    def calculate_initial_popularity(self, content: str, category: str) -> int:
        """Calculate initial popularity score"""
        score = 50  # Base score
        
        # Boost for certain keywords
        boost_keywords = ['first', 'largest', 'smallest', 'only', 'unique', 'discovered', 'mystery']
        for keyword in boost_keywords:
            if keyword in content.lower():
                score += 10
        
        # Adjust based on category popularity
        category_popularity = {
            'history': 15,
            'science': 20,
            'nature': 15,
            'technology': 25,
            'culture': 10,
            'art': 10
        }
        
        score += category_popularity.get(category, 0)
        
        return min(100, max(0, score))
    
    def extract_key_words(self, content: str) -> List[str]:
        """Extract key words/phrases from content"""
        # Simple keyword extraction
        words = content.split()
        key_words = []
        
        for i, word in enumerate(words):
            if word.lower() in ['is', 'was', 'are', 'were', 'the', 'a', 'an']:
                continue
            if len(word) > 5 and word.isalpha():
                key_words.append(word)
                
        return key_words[:5]
    
    def save_fact_to_dynamodb(self, fact: Fact) -> bool:
        """Save a fact to DynamoDB"""
        try:
            fact_id = f"fact_{int(time.time())}_{str(uuid.uuid4())[:8]}"
            
            item = {
                'id': fact_id,
                'title': fact.title,
                'content': fact.content,
                'category': fact.category,
                'tags': fact.tags,
                'difficulty': fact.difficulty,
                'readingTime': fact.reading_time,
                'source': fact.source,
                'sourceUrl': fact.source_url,
                'popularity': fact.popularity,
                'createdAt': datetime.now(timezone.utc).isoformat(),
                'updatedAt': datetime.now(timezone.utc).isoformat(),
                'views': 0,
                'likes': 0,
                'shares': 0,
                'dislikes': 0
            }
            
            self.facts_table.put_item(Item=item)
            return True
            
        except Exception as e:
            logger.error(f"Error saving fact to DynamoDB: {e}")
            return False
    
    def scrape_category(self, category: str, max_articles: int = 10) -> int:
        """Scrape facts for a specific category"""
        logger.info(f"Starting to scrape category: {category}")
        
        articles = self.get_wikipedia_articles(category, max_articles)
        logger.info(f"Found {len(articles)} articles for category {category}")
        
        facts_saved = 0
        
        for article in tqdm(articles, desc=f"Processing {category}"):
            try:
                facts = self.extract_facts_from_article(article, category)
                
                for fact in facts:
                    if self.save_fact_to_dynamodb(fact):
                        facts_saved += 1
                        self.facts_saved += 1
                    
                    self.facts_processed += 1
                
                # Rate limiting
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"Error processing article {article}: {e}")
                continue
        
        logger.info(f"Saved {facts_saved} facts for category {category}")
        return facts_saved
    
    def run_scraper(self, categories: List[str] = None, max_articles_per_category: int = 10):
        """Run the scraper for specified categories"""
        if categories is None:
            categories = list(self.categories.keys())
        
        logger.info(f"Starting Wikipedia scraper for categories: {categories}")
        logger.info(f"Max articles per category: {max_articles_per_category}")
        
        total_facts = 0
        
        for category in categories:
            if category not in self.categories:
                logger.warning(f"Unknown category: {category}")
                continue
                
            try:
                facts_count = self.scrape_category(category, max_articles_per_category)
                total_facts += facts_count
                
                # Delay between categories
                time.sleep(2)
                
            except Exception as e:
                logger.error(f"Error scraping category {category}: {e}")
                continue
        
        logger.info(f"Scraping completed. Total facts processed: {self.facts_processed}")
        logger.info(f"Total facts saved: {self.facts_saved}")
        
        return total_facts

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Wikipedia Facts Scraper')
    parser.add_argument(
        '--categories', 
        nargs='+', 
        help='Categories to scrape (space-separated)',
        choices=['history', 'science', 'nature', 'technology', 'culture', 'art'],
        default=None
    )
    parser.add_argument(
        '--max-articles', 
        type=int, 
        default=10,
        help='Maximum articles per category'
    )
    parser.add_argument(
        '--test', 
        action='store_true',
        help='Run in test mode (limited scraping)'
    )
    
    args = parser.parse_args()
    
    # Initialize scraper
    scraper = WikipediaScraper()
    
    # Adjust for test mode
    if args.test:
        args.max_articles = 2
        logger.info("Running in test mode")
    
    # Run the scraper
    try:
        total_facts = scraper.run_scraper(
            categories=args.categories,
            max_articles_per_category=args.max_articles
        )
        
        print(f"\n✅ Scraping completed successfully!")
        print(f"📊 Total facts saved: {total_facts}")
        
    except KeyboardInterrupt:
        logger.info("Scraping interrupted by user")
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Scraping failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 