import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  Image,
  Animated,
  ImageSourcePropType,
} from 'react-native';
import { getImageUrl } from '../src/config/constants';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.7;
const ITEM_HEIGHT = ITEM_WIDTH * 1.1;
const SPACING = 20;
const CONTAINER_PADDING = 40;

interface CourseData {
  course_id: number;
  thumbnail_url?: string;
}

interface CourseCarouselProps {
  courses: CourseData[];
  defaultImage: ImageSourcePropType;
  onCourseChange: (index: number) => void;
}

const CourseCarousel: React.FC<CourseCarouselProps> = ({
  courses,
  defaultImage,
  onCourseChange,
}) => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<any>>(null);

  useEffect(() => {
    const listener = scrollX.addListener(({ value }) => {
      const index = Math.round(value / (ITEM_WIDTH + SPACING));
      if (!isNaN(index) && index >= 0 && index < courses.length) {
        onCourseChange(index);
      }
    });
    return () => scrollX.removeListener(listener);
  }, [scrollX, courses.length, onCourseChange]);

  const getImageUrlWithFallback = (imageUrl: string | null | undefined): any => {
    if (!imageUrl || imageUrl === 'undefined' || imageUrl.trim() === '') {
      return defaultImage;
    }
    const fullUrl = getImageUrl(imageUrl);
    return fullUrl ? { uri: fullUrl } : defaultImage;
  };

  const renderItem = ({ item, index }: { item: CourseData; index: number }) => {
    const inputRange = [
      (index - 1) * (ITEM_WIDTH + SPACING),
      index * (ITEM_WIDTH + SPACING),
      (index + 1) * (ITEM_WIDTH + SPACING),
    ];

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.3, 1, 0.3],
      extrapolate: 'clamp',
    });

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.7, 1, 0.7],
      extrapolate: 'clamp',
    });
    
    const translateX = scrollX.interpolate({
      inputRange,
      outputRange: [-50, 0, 50],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[
          styles.itemContainer,
          {
            opacity,
            transform: [{ scale }, { translateX }],
          },
        ]}
      >
        <Image
          source={getImageUrlWithFallback(item.thumbnail_url)}
          style={styles.image}
        />
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={courses}
        renderItem={renderItem}
        keyExtractor={(item) => item.course_id.toString()}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_WIDTH + SPACING}
        decelerationRate="fast"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        contentContainerStyle={styles.listContent}
        bounces={false}
        pagingEnabled
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: ITEM_HEIGHT,
    marginVertical: 20,
  },
  listContent: {
    paddingHorizontal: CONTAINER_PADDING,
    alignItems: 'center',
  },
  itemContainer: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    marginHorizontal: SPACING / 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
});

export default CourseCarousel;
