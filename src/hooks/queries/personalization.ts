import{useMutation,useQuery,useQueryClient}from'@tanstack/react-query';import{createPersonalizationService,type PersonalizationSettings}from'@/personalization'
const service=createPersonalizationService();export const personalizationKey=['personalization','settings']as const
export function usePersonalization(){return useQuery({queryKey:personalizationKey,queryFn:()=>service.load()})}
export function useSavePersonalization(){const client=useQueryClient();return useMutation({mutationFn:(value:PersonalizationSettings)=>service.save(value),onSuccess:(value)=>client.setQueryData(personalizationKey,value)})}
export function useResetPersonalization(){const client=useQueryClient();return useMutation({mutationFn:()=>service.reset(),onSuccess:(value)=>client.setQueryData(personalizationKey,value)})}
