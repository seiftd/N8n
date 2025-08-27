import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { workflowAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { WorkflowCard } from '../components/WorkflowCard';
import { FloatingActionButton } from '../components/FloatingActionButton';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  lastExecuted?: string;
  executionCount: number;
  successRate: number;
  category: string;
  tags: string[];
}

export const WorkflowListScreen: React.FC = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'draft'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: workflows,
    isLoading,
    error,
    refetch,
  } = useQuery(
    ['workflows', user?.id, filterStatus, searchQuery],
    () => workflowAPI.getWorkflows({
      status: filterStatus === 'all' ? undefined : filterStatus,
      search: searchQuery || undefined,
    }),
    {
      enabled: !!user,
      staleTime: 30000, // 30 seconds
    }
  );

  const deleteWorkflowMutation = useMutation(workflowAPI.deleteWorkflow, {
    onSuccess: () => {
      queryClient.invalidateQueries(['workflows']);
      Alert.alert('Success', 'Workflow deleted successfully');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to delete workflow');
    },
  });

  const toggleWorkflowStatusMutation = useMutation(workflowAPI.updateWorkflow, {
    onSuccess: () => {
      queryClient.invalidateQueries(['workflows']);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update workflow status');
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleWorkflowPress = (workflow: Workflow) => {
    navigation.navigate('WorkflowDetail', { workflowId: workflow.id });
  };

  const handleExecuteWorkflow = async (workflowId: string) => {
    try {
      await workflowAPI.executeWorkflow(workflowId);
      Alert.alert('Success', 'Workflow execution started');
      queryClient.invalidateQueries(['workflows']);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to execute workflow');
    }
  };

  const handleToggleStatus = (workflow: Workflow) => {
    const newStatus = workflow.status === 'active' ? 'inactive' : 'active';
    
    Alert.alert(
      'Confirm',
      `${newStatus === 'active' ? 'Activate' : 'Deactivate'} workflow "${workflow.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            toggleWorkflowStatusMutation.mutate({
              id: workflow.id,
              status: newStatus,
            });
          },
        },
      ]
    );
  };

  const handleDeleteWorkflow = (workflow: Workflow) => {
    Alert.alert(
      'Delete Workflow',
      `Are you sure you want to delete "${workflow.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteWorkflowMutation.mutate(workflow.id),
        },
      ]
    );
  };

  const filteredWorkflows = workflows?.filter((workflow: Workflow) =>
    workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    workflow.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    workflow.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const renderWorkflowItem = ({ item }: { item: Workflow }) => (
    <WorkflowCard
      workflow={item}
      onPress={() => handleWorkflowPress(item)}
      onExecute={() => handleExecuteWorkflow(item.id)}
      onToggleStatus={() => handleToggleStatus(item)}
      onDelete={() => handleDeleteWorkflow(item)}
    />
  );

  const renderFilterChips = () => (
    <View style={styles.filterContainer}>
      {(['all', 'active', 'inactive', 'draft'] as const).map((status) => (
        <TouchableOpacity
          key={status}
          style={[
            styles.filterChip,
            filterStatus === status && styles.filterChipActive,
          ]}
          onPress={() => setFilterStatus(status)}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === status && styles.filterChipTextActive,
            ]}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="work-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No Workflows Found</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery
          ? 'Try adjusting your search terms'
          : 'Create your first workflow to get started'}
      </Text>
      {!searchQuery && (
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('WorkflowCreate')}
        >
          <Text style={styles.createButtonText}>Create Workflow</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        message="Failed to load workflows"
        onRetry={refetch}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={24} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search workflows..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}
          >
            <Icon name="clear" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      {renderFilterChips()}

      {/* Workflow List */}
      <FlatList
        data={filteredWorkflows}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkflowItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button */}
      <FloatingActionButton
        icon="add"
        onPress={() => navigation.navigate('WorkflowCreate')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: '#333',
  },
  clearButton: {
    padding: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    backgroundColor: '#e9ecef',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#007bff',
  },
  filterChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  createButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});